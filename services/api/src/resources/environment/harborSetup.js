// @flow

/* ::
import type MariaSQL from 'mariasql';
*/

const harborClient = require('../../clients/harborClient');
const logger = require('../../logger');
const R = require('ramda');
const Sql = require('../env-variables/sql');
const { isPatchEmpty, prepare, query, whereAnd } = require('../../util/db');

const lagoonHarborRoute = R.compose(
  R.defaultTo('http://172.17.0.1:8084'),
  R.find(R.test(/harbor-nginx/)),
  R.split(','),
  R.propOr('', 'LAGOON_ROUTES'),
)(process.env);

const createHarborOperations = (sqlClient /* : MariaSQL */) => ({
  addEnvironment: async (lagoonProjectName, projectID) => {
    // Create harbor project
    try {
      var res = await harborClient.post(`projects`, {
        body: {
          count_limit: -1,
          project_name: lagoonProjectName,
          storage_limit: -1,
          metadata: {
            auto_scan: "true",
            reuse_sys_cve_whitelist: "true",
            public: "false"
          }
        }
      });
      logger.debug(`Harbor project ${lagoonProjectName} created!`)
    } catch (err) {
      // 409 means project already exists
      // 201 means project created successfully
      if (err.statusCode == 409) {
        logger.info(`Unable to create the harbor project "${lagoonProjectName}", as it already exists in harbor!`)
      } else {
        console.log(res)
        logger.error(`Unable to create the harbor project "${lagoonProjectName}" !!`, err)
      }
    }

    // Get new harbor project's id
    try {
      const res = await harborClient.get(`projects?name=${lagoonProjectName}`)
      var harborProjectID = res.body[0].project_id
      logger.debug(`Got the harbor project id for project ${lagoonProjectName} successfully!`)
    } catch (err) {
      // 409 means project already exists
      // 201 means project created successfully
      if (err.statusCode == 404) {
        logger.error(`Unable to get the harbor project id of "${lagoonProjectName}", as it does not exist in harbor!`)
      } else {
        logger.error(`Unable to get the harbor project id of "${lagoonProjectName}" !!`)
      }
    }

    console.log(harborProjectID)
    // Create robot account for new harbor project
    try {
      const res = await harborClient.post(`projects/${harborProjectID}/robots`, {
        body: {
          name: openshiftProjectName,
          access: [
            {
              resource: `/project/${harborProjectID}/repository`,
              action: "push"
            }
          ]
        }
      })
      console.log(res)
      var harborTokenInfo = res.body
      console.log(harborTokenInfo)
      logger.debug(`Robot was created for Harbor project ${lagoonProjectName} !`)
    } catch (err) {
      // 409 means project already exists
      // 201 means project created successfully
      if (err.statusCode == 409) {
        logger.error(`Unable to create a robot account for harbor project "${lagoonProjectName}", as a robot account of the same name already exists!`)
      } else {
        logger.error(`Unable to create a robot account for harbor project "${lagoonProjectName}" !!`)
      }
    }

    // Set Harbor env vars for lagoon environment
    try {
      await query(
        sqlClient,
        Sql.insertEnvVariable({
          "name": "INTERNAL_REGISTRY_URL",
          "value": lagoonHarborRoute,
          "scope": "INTERNAL_CONTAINER_REGISTRY",
          "project": projectID,
        }),
      );
      logger.debug(`Environment variable INTERNAL_REGISTRY_URL for ${lagoonProjectName} created!`)

    } catch (err) {
      logger.error("Initial var already set!!")
    }

    try {
      await query(
        sqlClient,
        Sql.insertEnvVariable({
          "name": "INTERNAL_REGISTRY_USERNAME",
          "value": harborTokenInfo.name,
          "scope": "INTERNAL_CONTAINER_REGISTRY",
          "project": projectID,
        }),
      );
      logger.debug(`Environment variable INTERNAL_REGISTRY_USERNAME for ${lagoonProjectName} created!`)

      await query(
        sqlClient,
        Sql.insertEnvVariable({
          "name": "INTERNAL_REGISTRY_PASSWORD",
          "value": harborTokenInfo.token,
          "scope": "INTERNAL_CONTAINER_REGISTRY",
          "project": projectID,
        }),
      );
      logger.debug(`Environment variable INTERNAL_REGISTRY_PASSWORD for ${lagoonProjectName} created!`)
    } catch (err) {
      logger.error("Something went wrong setting env vars!", err)
    }
  }
})

module.exports = createHarborOperations;
