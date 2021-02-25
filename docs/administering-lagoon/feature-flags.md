# Feature flags

Some Lagoon features can be controlled by setting feature flags.
This is designed to assist administrators to roll out new features in a controlled manner.

## Environment variables

The following environment variables can be set on an environment or project to toggle feature flags.

| Environment Variable Name                     | Active scope\* | Version introduced | Version removed | Default Value | Description                                                                                                                                                                                                                                                                                                                                       |
| ---                                           | ---            | ---                | ---             | ---           | ---                                                                                                                                                                                                                                                                                                                                               |
| `LAGOON_FEATURE_FLAG_ROOTLESS_WORKLOAD`       | `build`        | 2.0.0              | -               | `enabled`     | Set to `disabled` to allow the workload to run as root. This flag will eventually be deprecated, at which point rootless workloads will be enforced.                                                                                                                                                                                              |
| `LAGOON_FEATURE_FLAG_STANDARD_NETWORK_POLICY` | `build`        | 2.0.0              | -               | `enabled`     | Set to `disabled` to stop Lagoon adding a default namespace isolation network policy on deployment. This flag will eventually be deprecated, at which point the default network policy will be enforced.<br>NOTE: disabling this feature will _not_ remove any existing network policy from previous deployments. Those must be removed manually. |

\* Active scope indicates whether the variable must be set as `build` or `runtime` scope to take effect. `global` sets the variable in both scopes, so that should work too.
