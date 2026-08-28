# Unit369 tool capability matrix

The screenshots mix three different things: capabilities Unit369 can own, open-source engines Unit369 can run, and third-party products Unit369 can only connect to. Product status must keep those categories separate so a product name is never presented as an implemented feature.

## Implemented native foundation

| Capability                           | Native Unit369 implementation                  | Current engine                                                     | External account required                                  |
| ------------------------------------ | ---------------------------------------------- | ------------------------------------------------------------------ | ---------------------------------------------------------- |
| Conversation and planning            | Unit369 intelligence contract and orchestrator | Unit369 Native plus owner-controlled Qwen when available           | No                                                         |
| Documents, designs and presentations | Native create APIs and per-owner storage       | Unit369 Worker + Durable Objects                                   | No                                                         |
| Projects and tasks                   | Native work APIs                               | Unit369 Worker + Durable Objects                                   | No                                                         |
| Structured business data             | Native business and data APIs                  | Unit369 Worker + Durable Objects                                   | No                                                         |
| Files                                | Native file API; optional R2 upgrade           | Durable Objects by default                                         | No                                                         |
| Approvals and automation state       | One-time approval and execution records        | ToolStore Durable Object                                           | No                                                         |
| Python data work                     | Owner-approved isolated execution              | Cloudflare Sandbox with NumPy, Pandas, Matplotlib and scikit-learn | No third-party SaaS account; Workers Paid runtime required |
| JavaScript/TypeScript execution      | Owner-approved isolated execution              | Cloudflare Sandbox                                                 | No third-party SaaS account; Workers Paid runtime required |
| Multi-file project checks and tests  | Owner-approved workspace execution             | Temporary Cloudflare Sandbox with downloadable artifacts           | No third-party SaaS account; Workers Paid runtime required |

## Native capability targets from the screenshots

These are product outcomes Unit369 can own without copying another company's service:

| Requested area                  | Unit369-owned target                                                                                   | Status                                                                                   |
| ------------------------------- | ------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| Natural-language processing     | classification, extraction, summarization and semantic search through owned models and local libraries | Partial                                                                                  |
| Machine learning                | dataset preparation, scikit-learn training/evaluation and model artifacts                              | Execution engine ready; guided workflows pending                                         |
| Data analysis and visualization | NumPy/Pandas analysis plus Matplotlib and browser-native charts                                        | Core execution and downloadable artifact flow ready; guided Data Lab pending             |
| Web application development     | native code workspaces, file editing, snapshots, preview, build and tests                              | Workspace import and isolated Python/JavaScript multi-file runner ready; preview pending |
| Testing                         | test plans, isolated test execution and bounded logs                                                   | Python unittest and Node test adapters ready; more framework adapters pending            |
| Deployment                      | build artifact, approval, deploy and rollback contracts                                                | Pending                                                                                  |
| Data protection                 | encryption, secret isolation, permissions and audit trail                                              | Partial                                                                                  |
| Collaboration                   | native projects, threads, messages and notifications                                                   | Core APIs implemented; real-time/team UX pending                                         |
| Chatbots                        | Unit369-owned conversational agents and knowledge                                                      | Partial                                                                                  |
| Audio/video                     | transcription, generation and editing pipeline                                                         | Pending                                                                                  |
| Virtual environments/simulation | sandboxed simulation workloads and rendered artifacts                                                  | Pending                                                                                  |
| Network analysis                | approved diagnostic jobs and reports                                                                   | Pending; privileged network control is intentionally excluded                            |

## Open-source engines, not separate products

- Already in the first execution image: NumPy, Pandas, Matplotlib and scikit-learn.
- Candidates for specialized images after resource testing: OpenCV, NLTK and spaCy.
- Heavy GPU frameworks require a separate image and cost profile: PyTorch, TensorFlow and Keras.
- React, Angular, Vue, D3.js, Selenium, Appium, JUnit, Docker and Kubernetes are build/test/deployment technologies. Unit369 can generate and operate projects that use them; merely listing their names does not make the capability implemented.

## Optional external connections

Slack, Microsoft Teams, Asana, Zoom, Webex, Skype, Tableau Server, Power BI Server, Google Cloud Natural Language, Amazon Comprehend, Azure Cognitive Services, IBM Watson and Salesforce Einstein are third-party systems. Unit369 cannot truthfully "own" those products. It can provide native equivalents for the underlying jobs and optional adapters for a user's existing account.

An optional adapter is considered complete only after OAuth or server-side credentials, least-privilege scopes, revocation, rate limits, audit logging, error recovery and regression tests are present. No adapter may be required for Unit369 Core to start.

## Delivery order

1. Isolated interpreter and approval contract — implemented in this release.
2. Chat-to-tool confirmation UI and bounded execution result cards — implemented.
3. Multi-file workspace sync, dependency allowlist, builds and tests — implemented.
4. Native data-analysis and visualization artifact flows — next.
5. OpenCV/NLP specialized image after size and cold-start tests.
6. Scheduled automation and deploy/rollback contracts.
7. Audio/video and GPU framework images under separate cost ceilings.
8. Optional third-party adapters only when an existing external account must be operated.
