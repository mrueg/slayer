

export const CLOUD_CATALOG = [
  { provider: 'AWS', name: 'S3 (Standard)', sla: 99.9, mttr: 120, icon: 'hardDrive' },
  { provider: 'AWS', name: 'Lambda', sla: 99.95, mttr: 15, icon: 'zap' },
  { provider: 'AWS', name: 'RDS (Multi-AZ)', sla: 99.95, mttr: 60, icon: 'database' },
  { provider: 'AWS', name: 'DynamoDB (Standard)', sla: 99.9, mttr: 20, icon: 'database' },
  { provider: 'AWS', name: 'DynamoDB (Global Tables)', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'AWS', name: 'EC2 (Instance)', sla: 99.5, mttr: 60, icon: 'server' },
  { provider: 'AWS', name: 'Route53 (DNS)', sla: 100, mttr: 0, icon: 'globe' },
  { provider: 'AWS', name: 'CloudFront (CDN)', sla: 99.9, mttr: 45, icon: 'globe' },
  { provider: 'AWS', name: 'API Gateway', sla: 99.95, mttr: 15, icon: 'zap' },
  { provider: 'Azure', name: 'SQL Database', sla: 99.99, mttr: 30, icon: 'database' },
  { provider: 'Azure', name: 'App Service', sla: 99.95, mttr: 45, icon: 'cloud' },
  { provider: 'Azure', name: 'Cosmos DB', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'Azure', name: 'Virtual Machines', sla: 99.9, mttr: 60, icon: 'server' },
  { provider: 'GCP', name: 'Compute Engine', sla: 99.9, mttr: 60, icon: 'server' },
  { provider: 'GCP', name: 'Cloud Storage', sla: 99.9, mttr: 90, icon: 'hardDrive' },
  { provider: 'GCP', name: 'Cloud Spanner', sla: 99.999, mttr: 10, icon: 'database' },
  { provider: 'GCP', name: 'BigQuery', sla: 99.9, mttr: 60, icon: 'database' },
  { provider: 'Cloudflare', name: 'Edge Workers', sla: 99.99, mttr: 5, icon: 'zap' },
  { provider: 'Cloudflare', name: 'KV Storage', sla: 99.99, mttr: 10, icon: 'database' },
];
