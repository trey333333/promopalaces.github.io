# Future Execution-Enablement Authorization

No agent is enabled by this repository. A future enablement request must be rejected unless it has one approved, unexpired entry in `governance/decision-log.json` for the `execution_enablement` gate.

That entry must identify the named registry agent, exact bounded scope, UTC start and expiry timestamps, allowlisted tools, stop condition, owner approver, and nonempty evidence. It must not authorize publishing, deployment, spending, external communication, data export, affiliate applications, tracking changes, production configuration, or third-party integrations; those actions require their own gate decisions.

An empty decision log is the intended current state. Do not create placeholder approvals or alter an agent's `execution_status` from `disabled` without a separately authorized task and the required decision record.
