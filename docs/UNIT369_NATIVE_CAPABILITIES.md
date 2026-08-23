# Unit369 Native Capability Architecture

## Product rule
Unit369 Core must remain useful without any third-party account connection. External services are optional bridges to data or infrastructure outside Unit369, never owners of core product capability.

## Native capability domains

### 1. Intelligence
- conversational AI
- research and synthesis
- planning and decomposition
- multi-agent execution
- critique, verification and revision
- memory/knowledge retrieval scoped to the Unit369 user/workspace

### 2. Create
- rich documents and notes
- structured reports
- images and visual assets
- presentations and reusable content
- templates and brand assets

### 3. Build
- source files and projects
- code generation/editing/review
- version snapshots, diffs and rollback
- app/site preview and packaging
- tests and build pipelines

### 4. Work
- projects, tasks and milestones
- kanban/list/calendar views
- comments and activity
- team/workspace roles
- notifications and reminders

### 5. Data
- tables/collections
- schemas and records
- filtering, sorting and search
- imports/exports
- knowledge base and semantic retrieval

### 6. Automate
- triggers, conditions and actions
- scheduled jobs
- agent workflows
- approvals for destructive/external actions
- execution history and retry

### 7. Business
- contacts and CRM
- leads/opportunities
- products/catalog
- orders and inventory state
- invoices/quotes as Unit369 documents
- analytics and dashboards

### 8. Communicate
- internal workspace messages
- AI-assisted drafting
- threads/comments
- notifications
- shared artifacts

### 9. Files
- Unit369-owned file storage abstraction
- folders/tags/search
- uploads/downloads
- artifact attachment to projects, chats and records
- access control

### 10. Orchestrate
- capability registry
- intent-to-plan routing
- dependency graph
- permission checks
- execution engine
- result verification
- audit trail

## External connections
External connections are adapters only. Examples: Google Drive for a user's existing Drive files, GitHub for publishing to an existing GitHub repository, Shopify for an existing Shopify store, Slack for an existing Slack workspace, and payment processors for card-network payment execution.

No external adapter may become a required dependency for a native Unit369 capability.

## Architecture rules
1. One owner per capability and one active runtime path.
2. No wrapper-over-wrapper UI architecture.
3. Native capability contracts are provider-neutral.
4. External adapters implement native contracts; they do not define them.
5. Secrets stay server-side. Users should not paste provider API keys into the client.
6. Destructive/external writes require explicit policy/approval gates.
7. User/workspace data is isolated by stable Unit369 identity.
8. Every capability has regression tests before production merge.
9. Unit369 logo and established blue/black brand tokens are product invariants.
10. Third-party removal happens capability-by-capability only after the native replacement is tested.

## Migration order
1. Capability registry + native orchestrator contract.
2. Native Files + Data foundation.
3. Native Documents/Knowledge.
4. Native Projects/Tasks.
5. Native Build/Code workspace.
6. Native Automation engine.
7. Native CRM/Business/Commerce management.
8. Native internal communication.
9. Native visual/content creation.
10. Reduce third-party catalog to optional External Connections.

## Definition of done for a third-party replacement
A third-party dependency is removable from Unit369 Core only when the equivalent native capability can be created, read, updated, deleted where appropriate, searched, permission-checked, orchestrated by AI, persisted per user/workspace, and covered by end-to-end regression tests.