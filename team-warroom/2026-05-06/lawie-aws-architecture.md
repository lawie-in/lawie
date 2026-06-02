# Lawie — Phase 1 AWS Architecture

**Region:** ap-south-1 (Mumbai) | **Topology:** Single-node Docker Compose on EC2 | **Owner:** Arjun (CTO)

```mermaid
flowchart TB
    %% Clients
    User["Advocate Browser<br/>(Next.js SPA)"]

    %% DNS + Edge
    DNS["Route 53 / Registrar DNS<br/>demo.lawie.in"]
    EIP["Elastic IP<br/>(static, ap-south-1)"]

    %% EC2 Host
    subgraph EC2["EC2 t3.medium · Ubuntu 24.04 · ap-south-1"]
        Nginx["Nginx :80/:443<br/>Let's Encrypt SSL<br/>Path-based routing"]

        subgraph Compose["Docker Compose Network"]
            Gateway["gateway-service :3000<br/>(Next.js SSR + static)"]
            Auth["auth-service :3001<br/>(login, JWT, sessions)"]
            Drafting["drafting-service :3002<br/>(SSE streaming drafts)"]
            Billing["billing-service :3003<br/>(Razorpay webhook, plans)"]
        end
    end

    %% AWS Managed
    Secrets["AWS Secrets Manager<br/>MONGODB_URI · JWT_SECRET<br/>RAZORPAY_KEY · REDIS_URL<br/>ANTHROPIC_API_KEY"]
    ECR["Amazon ECR<br/>Docker image registry"]

    %% External SaaS
    Mongo[("MongoDB Atlas<br/>Free M0 · Mumbai")]
    Redis[("Redis Cloud Free<br/>sessions + JWT denylist")]
    Anthropic["Anthropic API<br/>claude-sonnet-4-20250514"]
    Razorpay["Razorpay<br/>subscriptions + webhooks"]
    Sentry["Sentry<br/>error tracking"]

    %% CI/CD
    GHA["GitHub Actions<br/>build → push ECR → SSH deploy"]

    %% Flows
    User -->|"HTTPS"| DNS
    DNS --> EIP
    EIP --> Nginx

    Nginx -->|"/api/auth/*"| Auth
    Nginx -->|"/api/documents/*"| Drafting
    Nginx -->|"/api/billing/*"| Billing
    Nginx -->|"/*"| Gateway

    Auth --> Mongo
    Auth --> Redis
    Drafting --> Mongo
    Drafting -->|"streaming"| Anthropic
    Billing --> Mongo
    Billing <-->|"webhook + API"| Razorpay
    Gateway --> Auth
    Gateway --> Drafting
    Gateway --> Billing

    Auth -.error.-> Sentry
    Drafting -.error.-> Sentry
    Billing -.error.-> Sentry
    Gateway -.error.-> Sentry

    EC2 -.reads at boot.-> Secrets
    GHA -->|"docker push"| ECR
    GHA -->|"ssh + compose pull"| EC2
    EC2 -.pulls images.-> ECR

    %% Styling
    classDef aws fill:#FF9900,stroke:#232F3E,color:#000
    classDef external fill:#4A90E2,stroke:#1F3A5F,color:#fff
    classDef edge fill:#7ED321,stroke:#3A6B0F,color:#000
    classDef ci fill:#9B59B6,stroke:#5B3370,color:#fff

    class EC2,EIP,Secrets,ECR aws
    class Mongo,Redis,Anthropic,Razorpay,Sentry external
    class DNS,Nginx edge
    class GHA ci
```

## Request flow caption

An advocate hits `demo.lawie.in`, which resolves via DNS to the Elastic IP fronting our single `t3.medium` EC2 in `ap-south-1`. Nginx terminates TLS (Let's Encrypt) and path-routes the request: `/api/auth/*` to auth-service, `/api/documents/*` to drafting-service (which streams Claude Sonnet 4 tokens back via SSE), `/api/billing/*` to billing-service (Razorpay webhooks + subscription state), and everything else to the Next.js gateway-service. All four services share a Docker Compose network, read secrets from AWS Secrets Manager at boot, persist to MongoDB Atlas (M0, Mumbai), use Redis Cloud for sessions and JWT denylist, and emit errors to Sentry. CI/CD: GitHub Actions builds and pushes images to ECR, then SSHes into EC2 to run `docker compose pull && up -d`.

## Phase 2 migration trigger (single-node → ECS Fargate)

Migrate off single-EC2 Docker Compose to ECS Fargate (or EKS) when **any one** of the following hits:

| Trigger | Threshold |
|---|---|
| Concurrent active drafters | > 50 sustained |
| EC2 CPU p95 | > 70% for 7 consecutive days |
| Drafting-service p95 latency | > 8s (excluding LLM) |
| Paying users | > 100 |
| Single-host downtime impact | First customer-reported outage |

Until then, vertical scale (`t3.medium` → `t3.large` → `m6i.large`) is cheaper, simpler, and faster to recover than orchestration overhead.

---

*Diagram source: maintained by Arjun (CTO). Notion: Engineering › Architecture › Phase 1 Topology.*
