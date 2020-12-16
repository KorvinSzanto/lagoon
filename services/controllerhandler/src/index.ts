const promisify = require('util').promisify;
import R from 'ramda';
import { logger } from '@lagoon/commons/dist/local-logging';
import {
  sendToLagoonLogs,
  initSendToLagoonLogs
} from '@lagoon/commons/dist/logs';
import {
  consumeTasks,
  initSendToLagoonTasks
} from '@lagoon/commons/dist/tasks';
import {
  getOpenShiftInfoForProject,
  getEnvironmentByName,
  updateEnvironment,
  updateDeployment,
  getDeploymentByName,
  getDeploymentByRemoteId,
  setEnvironmentServices,
  deleteEnvironment,
  updateTask,
  updateProject
} from '@lagoon/commons/dist/api';

initSendToLagoonLogs();
initSendToLagoonTasks();

const ocsafety = string =>
  string.toLocaleLowerCase().replace(/[^0-9a-z-]/g, '-');

const decode = (str: string):string => Buffer.from(str, 'base64').toString('binary');

const updateLagoonTask = async (meta) => {
  // Update lagoon task
  try {
    const convertDateFormat = R.init;
    const dateOrNull = R.unless(R.isNil, convertDateFormat) as any;
    let completedDate = dateOrNull(meta.endTime) as any;

    if (meta.jobStatus === 'failed') {
      completedDate = dateOrNull(meta.endTime);
    }

    // transform the jobstatus into one the API knows about
    let jobStatus = 'active';
    switch (meta.jobStatus) {
      case 'pending':
        jobStatus = 'active'
        break;
      case 'running':
        jobStatus = 'active'
        break;
      case 'complete':
        jobStatus = 'succeeded'
        break;
      default:
        jobStatus = meta.jobStatus
        break;
    }
    // update the actual task now
    await updateTask(Number(meta.task.id), {
      remoteId: meta.remoteId,
      status: jobStatus.toUpperCase(),
      started: dateOrNull(meta.startTime),
      completed: completedDate
    });
  } catch (error) {
    logger.error(
      `Could not update task ${meta.project} ${meta.jobName} ${meta.remoteId}. Message: ${error}`
    );
  }
}

const messageConsumer = async function(msg) {
  const {
    type,
    namespace,
    meta,
   } = JSON.parse(msg.content.toString());


  switch (type) {
    case 'build':
      logger.verbose(
        `Received deployment and environment update task ${meta.buildName} - ${meta.buildPhase}`
      );
      try {
        let deploymentId;
        try {
          // try get the ID from our build UID
          const deployment = await getDeploymentByRemoteId(meta.remoteId);
          if (!deployment.deploymentByRemoteId) {
            // otherwise find it using the build name
            const deploymentResult = await getDeploymentByName(namespace, meta.buildName);
            deploymentId = deploymentResult.environment.deployments[0].id;
          } else {
            deploymentId = deployment.deploymentByRemoteId.id
          }
        }catch(error) {
          logger.warn(`Error while fetching deployment openshiftproject: ${namespace}: ${error}`)
          throw(error)
        }

        const convertDateFormat = R.init;
        const dateOrNull = R.unless(R.isNil, convertDateFormat) as any;

        await updateDeployment(deploymentId, {
          remoteId: meta.remoteId,
          status: meta.buildPhase.toUpperCase(),
          started: dateOrNull(meta.startTime),
          completed: dateOrNull(meta.endTime),
        });
      } catch (error) {
        logger.error(`Could not update deployment ${meta.project} ${meta.Buildname}. Message: ${error}`);
      }


      let environment;
      let project;
      try {
        const projectResult = await getOpenShiftInfoForProject(meta.project);
        project = projectResult.project

        const environmentResult = await getEnvironmentByName(meta.environment, project.id)
        environment = environmentResult.environmentByName
      } catch (err) {
        logger.warn(`${namespace} ${meta.buildName}: Error while getting project or environment information, Error: ${err}. Continuing without update`)
      }

      try {
        await updateEnvironment(
          environment.id,
          `{
            openshiftProjectName: "${namespace}",
          }`
        );
      } catch (err) {
        logger.warn(`${namespace} ${meta.buildName}: Error while updating openshiftProjectName in API, Error: ${err}. Continuing without update`)
      }
      // Update GraphQL API if the Environment has completed or failed
      switch (meta.buildPhase) {
        case 'complete':
        case 'failed':
        case 'cancelled':
          try {
            // update the environment with the routes etc
            await updateEnvironment(
              environment.id,
              `{
                route: "${meta.route}",
                routes: "${meta.routes}",
                monitoringUrls: "${meta.monitoringUrls}",
                project: ${project.id}
              }`
            );
            // update the environment with the services available
            await setEnvironmentServices(environment.id, meta.services);
          } catch (err) {
            logger.warn(`${namespace} ${meta.buildName}: Error while updating routes in API, Error: ${err}. Continuing without update`)
          }
      }
      break;
    case 'remove':
      logger.verbose(`Received remove task for ${namespace}`);
      // Update GraphQL API that the Environment has been deleted
      try {
        await deleteEnvironment(meta.environment, meta.project, false);
        logger.info(
          `${meta.project}: Deleted Environment '${meta.environment}' in API`
        );
        meta.openshiftProject = meta.environment
        meta.openshiftProjectName = namespace
        meta.projectName = meta.project
        sendToLagoonLogs(
          'success',
          meta.project,
          '',
          'task:remove-kubernetes:finished',
          meta,
          `*[${meta.project}]* remove \`${meta.environment}\``
        );
      } catch (err) {
        logger.warn(`${namespace}: Error while deleting environment, Error: ${err}. Continuing without update`)
      }
      break;
    case 'task':
      logger.verbose(
        `Received task result for ${meta.task.name} from ${meta.project} - ${meta.environment} - ${meta.jobStatus}`
      );
      // if we want to be able to do something else when a task result comes through,
      // we can use the task key
      switch (meta.key) {
        // since the route migration uses the `advanced task` system, we can do something with the data
        // that we get back from the controllers
        case "kubernetes:route:migrate":
          switch (meta.jobStatus) {
            case "succeeded":
              try {
                // get the project ID
                const projectResult = await getOpenShiftInfoForProject(meta.project);
                const project = projectResult.project
                // since the advanceddata contains a base64 encoded value, we have to decode it first
                var decodedData = new Buffer(meta.advancedData, 'base64').toString('ascii')
                const taskResult = JSON.parse(decodedData)
                // the returned data for a route migration is specific to this task, so we use the values contained
                // to do something in the api
                // in the response, we want to swap these around, so production becomes standby
                // standby becomes production
                const response = await updateProject(project.id, {
                  productionEnvironment: taskResult.standbyProductionEnvironment,
                  standbyProductionEnvironment: taskResult.productionEnvironment,
                  productionRoutes: taskResult.productionRoutes,
                  standbyRoutes: taskResult.standbyRoutes,
                });
              } catch (err) {
                logger.warn(`${namespace}: Error while updating project, Error: ${err}. Continuing without update`)
              }
          }
          break;
        }
        // since the logging and other stuff is all sent via the controllers directly to message queues
        // we only need to update the task here with the status
        await updateLagoonTask(meta)
      break;
  }
};

const deathHandler = async (msg, lastError) => {
  const {
    type,
    namespace,
    meta,
  } = JSON.parse(msg.content.toString());

  sendToLagoonLogs(
    'error',
    meta.project,
    '',
    'task:remove-kubernetes:error', //@TODO: this probably needs to be changed to a new event type for the controllers to use?
    {},
    `*[${meta.project}]* remove \`${namespace}\` ERROR:
\`\`\`
${lastError}
\`\`\``
  );
};

const retryHandler = async (msg, error, retryCount, retryExpirationSecs) => {
  return;
};

consumeTasks('controller', messageConsumer, retryHandler, deathHandler);
