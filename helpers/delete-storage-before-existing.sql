DELETE environment_storage FROM `environment_storage` left join environment on (environment_storage.environment = environment.id) where environment_storage.updated < date(environment.created);