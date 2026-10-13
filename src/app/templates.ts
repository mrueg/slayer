import { SLAItem } from '@/lib/sla-calculator';

export const TEMPLATES: Record<string, { name: string, data: SLAItem }> = {
  serverless: {
    name: "Modern Serverless App (AWS)",
    data: {
      id: 'root',
      name: 'E-Commerce Platform',
      type: 'group',
      config: 'series',
      children: [
        { id: 'dns', name: 'Route53 DNS', type: 'component', sla: 100, replicas: 1, rto: 5, rpo: 0, notes: "AWS provides 100% SLA for Route53 DNS.", mttr: 5 },
        { id: 'cdn', name: 'CloudFront CDN', type: 'component', sla: 99.9, replicas: 1, rto: 15, rpo: 0, notes: "Includes edge locations and global delivery.", mttr: 45 },
        { 
          id: 'frontend', 
          name: 'Frontend Assets (S3)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          rto: 30,
          rpo: 60,
          notes: "Static hosting in US-East-1.",
          mttr: 60
        },
        {
          id: 'backend',
          name: 'API & Business Logic',
          type: 'group',
          config: 'series',
          notes: "Core transactional path.",
          children: [
            { id: 'api-g', name: 'API Gateway', type: 'component', sla: 99.95, replicas: 2, minReplicasRequired: 1, rto: 10, rpo: 0, mttr: 15 },
            { id: 'lambda', name: 'Lambda (Compute)', type: 'component', sla: 99.95, replicas: 3, minReplicasRequired: 2, rto: 5, rpo: 0, mttr: 10 },
            { id: 'dynamo', name: 'DynamoDB (Global)', type: 'component', sla: 99.999, replicas: 1, rto: 15, rpo: 5, notes: "Global tables with multi-region replication.", mttr: 5 },
          ]
        },
        { 
          id: 'analytics', 
          name: 'Optional Analytics (Segment)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          isOptional: true,
          rto: 120,
          rpo: 1440,
          notes: "Non-critical tracking. System remains functional if this fails.",
          mttr: 30
        },
      ]
    }
  },
  multi_az: {
    name: "High Availability DB Cluster",
    data: {
      id: 'root',
      name: 'PostgreSQL HA Cluster',
      type: 'group',
      config: 'parallel',
      failoverSla: 99.99,
      notes: "Standard HA pattern with primary and hot standby.",
      children: [
        { 
          id: 'primary', 
          name: 'Primary Node (US-East-1a)', 
          type: 'component', 
          sla: 99.95, 
          replicas: 1,
          rto: 30,
          rpo: 0,
          notes: "Single-instance SLA for RDS.",
          mttr: 60
        },
        { 
          id: 'standby', 
          name: 'Hot Standby (US-East-1b)', 
          type: 'component', 
          sla: 99.95, 
          replicas: 1,
          rto: 5,
          rpo: 0,
          notes: "Synchronous replication enabled.",
          mttr: 60
        },
        { 
          id: 'backup', 
          name: 'Cold Backup (S3)', 
          type: 'component', 
          sla: 99.9, 
          replicas: 1,
          isOptional: true,
          rto: 240,
          rpo: 1440,
          notes: "Daily snapshots. RTO: 4 hours.",
          mttr: 240
        },
      ]
    }
  },
  on_prem: {
    name: "On-Premise Tier-III Datacenter",
    data: {
      id: 'root',
      name: 'Corporate Datacenter',
      type: 'group',
      config: 'series',
      notes: "Physical facility dependencies.",
      children: [
        {
          id: 'power',
          name: 'Power Infrastructure',
          type: 'group',
          config: 'parallel',
          failoverSla: 99.999,
          notes: "Dual utility feeds with automatic ATS.",
          children: [
            { id: 'grid', name: 'Utility Grid Feed', type: 'component', sla: 99.9, replicas: 1, rto: 240, rpo: 0, notes: "Reliability of local municipality feed.", mttr: 120 },
            { id: 'gen', name: 'Diesel Generators', type: 'component', sla: 99.0, replicas: 2, rto: 1, rpo: 0, notes: "N+1 configuration with 48h fuel supply.", mttr: 15 },
          ]
        },
        {
          id: 'cooling',
          name: 'CRAC Cooling Units',
          type: 'group',
          config: 'parallel',
          notes: "Maintained at 22°C +/- 2°C.",
          children: [
            { id: 'chiller-1', name: 'Chiller A', type: 'component', sla: 99.5, replicas: 1, rto: 120, rpo: 0, mttr: 180 },
            { id: 'chiller-2', name: 'Chiller B', type: 'component', sla: 99.5, replicas: 1, rto: 120, rpo: 0, mttr: 180 },
          ]
        },
        {
          id: 'net',
          name: 'Core Networking',
          type: 'group',
          config: 'series',
          notes: "Fully redundant 100G core.",
          children: [
            { id: 'edge-router', name: 'Border Routers', type: 'component', sla: 99.99, replicas: 2, rto: 15, rpo: 0, mttr: 30 },
            { id: 'core-switch', name: 'Core Switches', type: 'component', sla: 99.99, replicas: 2, rto: 15, rpo: 0, mttr: 30 },
          ]
        },
        {
          id: 'compute',
          name: 'Compute Racks',
          type: 'group',
          config: 'parallel',
          notes: "Virtualized workload clusters.",
          children: [
            { id: 'rack-1', name: 'Rack A (Blade Chassis)', type: 'component', sla: 99.9, replicas: 1, rto: 60, rpo: 15, mttr: 120 },
            { id: 'rack-2', name: 'Rack B (Blade Chassis)', type: 'component', sla: 99.9, replicas: 1, rto: 60, rpo: 15, mttr: 120 },
          ]
        }
      ]
    }
  },
  global_api: {
    name: "Edge-First Global API",
    data: {
      id: 'root',
      name: 'Global API Architecture',
      type: 'group',
      config: 'series',
      notes: "Multi-region active-active deployment.",
      children: [
        { id: 'global-dns', name: 'Route53 Latency Routing', type: 'component', sla: 100, replicas: 1, rto: 5, rpo: 0, notes: "Global entry point.", mttr: 5 },
        {
          id: 'regions',
          name: 'Regional Deployments',
          type: 'group',
          config: 'parallel',
          failoverSla: 99.9,
          notes: "Automatic failover between regions.",
          children: [
            { id: 'us-east', name: 'US-East Region (AWS)', type: 'component', sla: 99.99, replicas: 1, rto: 30, rpo: 0, notes: "Northern Virginia cluster.", mttr: 30 },
            { id: 'eu-west', name: 'EU-West Region (AWS)', type: 'component', sla: 99.99, replicas: 1, rto: 30, rpo: 0, notes: "Ireland cluster.", mttr: 30 },
            { id: 'ap-south', name: 'AP-South Region (AWS)', type: 'component', sla: 99.99, replicas: 1, rto: 30, rpo: 0, notes: "Mumbai cluster.", mttr: 30 },
          ]
        },
        { id: 'global-db', name: 'Aurora Global Database', type: 'component', sla: 99.99, replicas: 1, rto: 15, rpo: 1, notes: "Storage-level cross-region replication.", mttr: 10 },
      ]
    }
  },
  hybrid_cloud: {
    name: "Enterprise Hybrid Platform (Detailed)",
    data: {
      id: 'root',
      name: 'Financial Transaction Platform',
      type: 'group',
      config: 'series',
      notes: "Mission-critical hybrid stack spanning AWS and Private Datacenter.",
      children: [
        {
          id: 'ingress',
          name: 'Edge Ingress',
          type: 'group',
          config: 'series',
          children: [
            { id: 'dns', name: 'Global DNS', type: 'component', sla: 100, replicas: 1, rto: 5, rpo: 0, icon: 'globe', mttr: 5 },
            { id: 'waf', name: 'WAF & DDoS Shield', type: 'component', sla: 99.99, replicas: 1, rto: 15, rpo: 0, icon: 'shield', mttr: 15 },
          ]
        },
        {
          id: 'k8s-platform',
          name: 'Kubernetes Platform (EKS)',
          type: 'group',
          config: 'series',
          notes: "Modern cloud-native service layer.",
          children: [
            {
              id: 'k8s-control-plane',
              name: 'K8s Control Plane',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 2,
              notes: "High-availability etcd and API server cluster.",
              children: [
                { id: 'master-1', name: 'Control Node 1', type: 'component', sla: 99.95, replicas: 1, rto: 10, rpo: 0, icon: 'cpu', mttr: 30 },
                { id: 'master-2', name: 'Control Node 2', type: 'component', sla: 99.95, replicas: 1, rto: 10, rpo: 0, icon: 'cpu', mttr: 30 },
                { id: 'master-3', name: 'Control Node 3', type: 'component', sla: 99.95, replicas: 1, rto: 10, rpo: 0, icon: 'cpu', mttr: 30 },
              ]
            },
            {
              id: 'k8s-data-plane',
              name: 'Worker Node Groups',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 2,
              notes: "Requires at least 2 functional node groups for capacity.",
              children: [
                { id: 'ng-1', name: 'Node Group A (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, rto: 15, rpo: 5, icon: 'layers', mttr: 15 },
                { id: 'ng-2', name: 'Node Group B (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, rto: 15, rpo: 5, icon: 'layers', mttr: 15 },
                { id: 'ng-3', name: 'Node Group C (m5.large)', type: 'component', sla: 99.9, replicas: 5, minReplicasRequired: 3, rto: 15, rpo: 5, icon: 'layers', mttr: 15 },
              ]
            }
          ]
        },
        {
          id: 'dc-facility',
          name: 'On-Prem Private Cloud',
          type: 'group',
          config: 'series',
          notes: "Physical datacenter dependencies.",
          children: [
            {
              id: 'dc-power',
              name: 'Power & Cooling',
              type: 'group',
              config: 'parallel',
              failoverSla: 99.999,
              children: [
                { id: 'grid', name: 'Utility Grid Feed', type: 'component', sla: 99.9, replicas: 1, rto: 480, rpo: 0, icon: 'zapOff', mttr: 240 },
                { id: 'diesel', name: 'N+1 Diesel Generators', type: 'component', sla: 99.0, replicas: 2, minReplicasRequired: 1, rto: 1, rpo: 0, icon: 'zapOff', mttr: 10 },
              ]
            },
            {
              id: 'spine-leaf',
              name: 'Spine-Leaf Network',
              type: 'group',
              config: 'series',
              notes: "Non-blocking high-speed fabric.",
              children: [
                { id: 'spine', name: 'Core Spine Switches', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, rto: 30, rpo: 0, icon: 'network', mttr: 60 },
                { id: 'leaf', name: 'Top-of-Rack Leaf Switches', type: 'component', sla: 99.99, replicas: 2, minReplicasRequired: 1, rto: 15, rpo: 0, icon: 'network', mttr: 30 },
              ]
            },
            {
              id: 'compute-racks',
              name: 'HCI Compute Racks',
              type: 'group',
              config: 'parallel',
              minChildrenRequired: 1,
              notes: "Hyper-Converged Infrastructure nodes.",
              children: [
                {
                  id: 'rack-a',
                  name: 'Rack Unit A',
                  type: 'group',
                  config: 'series',
                  children: [
                    { id: 'pdu-a', name: 'Dual PDUs', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, rto: 120, rpo: 0, icon: 'zap', mttr: 120 },
                    { id: 'blades-a', name: 'Blade Chassis (16 Nodes)', type: 'component', sla: 99.9, replicas: 16, minReplicasRequired: 12, rto: 45, rpo: 15, icon: 'server', mttr: 45 }
                  ]
                },
                {
                  id: 'rack-b',
                  name: 'Rack Unit B',
                  type: 'group',
                  config: 'series',
                  children: [
                    { id: 'pdu-b', name: 'Dual PDUs', type: 'component', sla: 99.999, replicas: 2, minReplicasRequired: 1, rto: 120, rpo: 0, icon: 'zap', mttr: 120 },
                    { id: 'blades-b', name: 'Blade Chassis (16 Nodes)', type: 'component', sla: 99.9, replicas: 16, minReplicasRequired: 12, rto: 45, rpo: 15, icon: 'server', mttr: 45 }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  }
};
