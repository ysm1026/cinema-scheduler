output "mcp_service_url" {
  description = "Cloud Run MCP service URL"
  value       = google_cloud_run_v2_service.mcp.uri
}

output "scraper_job_name" {
  description = "Cloud Run scraper job name"
  value       = google_cloud_run_v2_job.scraper.name
}

output "data_bucket_name" {
  description = "GCS bucket name for data.db"
  value       = google_storage_bucket.data.name
}

output "artifact_registry_url" {
  description = "Artifact Registry repository URL"
  value       = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.main.repository_id}"
}

output "mcp_service_account_email" {
  description = "MCP service account email"
  value       = google_service_account.mcp.email
}

output "scraper_service_account_email" {
  description = "Scraper service account email"
  value       = google_service_account.scraper.email
}
