# slayer

> Raining Blood (and Uptime)

**slayer** is a modern composite SLA (Service Level Agreement) calculator. It helps you determine the total availability of complex systems by modeling components in series or parallel configurations.

## Features

- **Composite SLA Calculation**: Easily calculate the total availability of systems with multiple dependencies.
- **Series & Parallel Modeling**: 
  - **Series**: For components that depend on each other (Availability = A × B).
  - **Parallel**: For redundant components (Availability = 1 - (1-A) × (1-B)).
- **Downtime Projection**: Instantly see allowed downtime per year, month, and day.
- **Interactive UI**: Add, remove, and nest groups and components to match your infrastructure.
- **Built with**: Next.js, React, Tailwind CSS, and Lucide React.

## Getting Started

First, install the dependencies:

```bash
npm install
```

Then, run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## How it Works

### Series Configuration
In a series configuration, all components must be available for the system to be available. If you have two components with 99.9% SLA, the composite SLA is `99.9% * 99.9% = 99.8001%`.

### Parallel Configuration
In a parallel configuration, only one component needs to be available for the system to be functional. This represents redundancy. If you have two components with 99.9% SLA in parallel, the composite SLA is `1 - (0.1% * 0.1%) = 99.9999%`.

## License

Apache-2.0
