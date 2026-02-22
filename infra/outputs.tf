output "vm_external_ip" {
  description = "GCE instance external IP"
  value       = google_compute_address.main.address
}

output "mcp_url" {
  description = "MCP HTTP endpoint URL"
  value       = "http://${google_compute_address.main.address}:8080/mcp"
}

output "data_bucket_name" {
  description = "GCS bucket name for data.db"
  value       = google_storage_bucket.data.name
}

output "vm_service_account_email" {
  description = "VM service account email"
  value       = google_service_account.vm.email
}

output "wif_provider" {
  description = "Workload Identity Federation provider resource name"
  value       = var.github_repo != "" ? google_iam_workload_identity_pool_provider.github[0].name : ""
}

output "wif_service_account_email" {
  description = "GitHub Actions deploy service account email"
  value       = var.github_repo != "" ? google_service_account.github_actions[0].email : ""
}
