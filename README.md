# slayer

> South of Heaven, North of Five Nines.

**slayer** is a reliability modeling and probabilistic risk analysis suite designed for infrastructure architects and SREs. It moves beyond simple calculators to model complex, multi-layered system availability, disaster recovery profiles, and yearly risk distributions.

**Live version:** [https://mrueg.github.io/slayer/](https://mrueg.github.io/slayer/)

## Core Features

### 1. Reliability Engine
*   **Hierarchical Modeling**: Build dependency trees of series and parallel groups, components and optional items.
*   **K-out-of-N Redundancy**: Exact success probability for replicas or groups that need a minimum number of members up (e.g. a 16-node blade chassis requiring 12 nodes).
*   **Failover**: Parallel groups model an active/standby primary with a "Failover %" for the switch and a switchover time per failover, or a k-of-n pool behind it.
*   **Shared Failure Domains**: Zones, regions or providers with their own SLA and MTTR; tagged items fail together (common-cause failures). Up to 10 per model.
*   **Shared Replica Failures**: A beta factor ("Shared %") for the share of failures that hit all replicas at once, such as the same bug or bad deploy.
*   **MTTR & Failure Frequency**: Derived consistently across the tree, so frequency × MTTR always matches the SLA.
*   **RTO & RPO**: Aggregates Recovery Time and Recovery Point Objectives across the tree and checks them against targets.

### 2. Probabilistic Risk Analysis
*   **Monte Carlo Simulation**: 10,000 simulated years in a background worker (Poisson incidents, exponential recoveries), reproducible from the shown seed.
*   **Distribution Histogram**: The long-tail risk of your architecture, including "bad year" (P95) and "calamity" (P99) outcomes.
*   **Incident-free Chance**: The probability of a week, month, quarter, year or custom window without any incident.
*   **Improvement Levers**: Ranks every item and failure domain by the downtime saved if it never failed; the top one is marked as the system bottleneck.
*   **Model Checks**: Flags setups that are valid but probably unintended, such as replicas that must all be up or redundancy defeated by a shared domain.

### 3. Chaos & Simulation
*   **Chaos Mode**: Interactive failure injection, including how many replicas of a redundant item to kill.
*   **Blast Radius Heatmap**: Colors nodes by the share of system SLA lost if they fail.
*   **Error Budgeting**: Tracks consumed downtime against the allowed downtime for a day, month or year.

### 4. Working with Models
*   **Infrastructure Topology**: Switch between the list editor and a horizontal or vertical topology diagram.
*   **Undo & Autosave**: Undo/redo every change; the model is saved in your browser.
*   **Export**: Configuration (JSON), report (Markdown or PDF) and topology diagram (SVG or PNG).
*   **Examples**: Common architectures to start from, plus a non-IT one: a metal concert.
*   **Cloud SLA Catalog**: Searchable published SLAs from AWS, Azure, GCP and Cloudflare.
*   **Technical Annotations**: Notes and assumptions on any item, shown in the editor, topology and exports.

## Technical Foundations

**slayer** is built with **Next.js 16**, **Tailwind CSS 4**, and **Lucide React**. It uses:
*   **Probability**: Exact k-of-n success probabilities via dynamic programming, also for non-identical availabilities.
*   **Common-cause failures**: Conditioning on shared failure domain states, and the beta-factor model for replicas.
*   **Failure frequency**: The Birnbaum importance formula for independent repairable components, which keeps MTTR consistent with availability.
*   **Simulation**: A seedable Monte Carlo engine (Poisson arrivals, exponential recoveries) running in a Web Worker.

## Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Checks
```bash
npm run lint
npm test
npm run build
```

### Zero-Backend Persistence
**slayer** has no backend. Your model is autosaved in your browser, **Share** copies a link with the whole model compressed into the URL, and **Export/Import** handles JSON files.

## License

Apache-2.0
