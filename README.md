# slayer

> South of Heaven, North of Five Nines.

**slayer** is a professional reliability engineering and probabilistic risk modeling suite designed for infrastructure architects and SREs. It moves beyond simple calculators to model complex, multi-layered system availability, disaster recovery profiles, and yearly risk distributions.

**Live version:** [https://mrueg.github.io/slayer/](https://mrueg.github.io/slayer/)

## Core Features

### 1. Advanced Reliability Engine
*   **Hierarchical Modeling**: Build complex dependency trees with nested groups and components.
*   **K-out-of-N Redundancy**: Model exact success probability for nodes requiring minimum capacity (e.g., a 16-node blade chassis requiring 12 nodes UP).
*   **Failover Switching**: Parallel configurations include a "Failover %" to model the reliability of the switch/load-balancer mechanism itself.
*   **MTTR & Frequency**: Derives system-wide Mean Time To Recovery using frequency-weighted averages of individual component restoration times.
*   **RTO & RPO Modeling**: Mathematically verifies Disaster Recovery goals by aggregating Recovery Time Objectives and Recovery Point Objectives across the tree.

### 2. Probabilistic Risk Analysis
*   **Monte Carlo Simulation**: Executes 10,000 yearly iterations using Poisson arrival rates for incidents and Exponential distributions for recovery durations.
*   **Distribution Histogram**: Visualizes the "long-tail" risk of your architecture, showing the probability of "Bad Year" (P95) and "Calamity" (P99) scenarios.
*   **Sensitivity-Based Bottlenecks**: Automatically identifies the "System Bottleneck"—the specific node where improvements would yield the highest gain in total system health.

### 3. Chaos & Simulation
*   **Chaos Mode**: An interactive failure injection environment.
*   **Granular Failure Magnitude**: For redundant components, specify exactly how many replicas to "Kill" to observe system degradation.
*   **Blast Radius Heatmap**: A visual overlay that colors nodes based on the percentage of total system SLA lost if they fail.
*   **Real-time Error Budgeting**: Tracks consumed downtime against allowed duration for specific periods (Day/Month/Year).

### 4. Interactive Visualizations
*   **Infrastructure Topology**: Toggle between a hierarchical list editor and a visual infrastructure diagram (Horizontal/Vertical).
*   **Technical Annotations**: Persistent technical notes and assumptions visible directly on the architecture nodes.
*   **Cloud SLA Catalog**: Searchable database of published SLAs from AWS, Azure, GCP, and Cloudflare to pre-populate models.

## Technical Foundations

**slayer** is built with **Next.js 15**, **Tailwind CSS 4**, and **Lucide React**. It utilizes several sophisticated mathematical models:
*   **Probability**: Exact success probability via dynamic programming for non-identical component SLAs in K-of-N groups.
*   **Stochastics**: Poisson arrival rate modeling for incident frequency.
*   **Simulation**: 10,000-run Monte Carlo engine with debounced real-time updates.

## Getting Started

### Installation
```bash
npm install
```

### Development
```bash
npm run dev
```

### Zero-Backend Persistence
**slayer** uses a "Shareable State" model. Your entire infrastructure design is encoded into a **Base64 URL hash**. You can share your model simply by copying the link—no database required. It also supports local **JSON Export/Import** for file-based configuration management.

## License

Apache-2.0
