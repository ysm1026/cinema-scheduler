variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region (for GCS bucket, Cloud Functions)"
  type        = string
  default     = "asia-northeast1"
}

variable "billing_account_id" {
  description = "GCP Billing Account ID (for budget alert)"
  type        = string
  default     = ""
}

# GCE Instance
variable "vm_zone" {
  description = "GCE instance zone (us-central1-a for free tier)"
  type        = string
  default     = "us-central1-a"
}

# Scraper
variable "scrape_days" {
  description = "Number of days to scrape ahead"
  type        = number
  default     = 3
}

variable "scrape_areas" {
  description = "Comma-separated list of area names to scrape (empty = all)"
  type        = string
  default     = ""
}

variable "scrape_concurrency" {
  description = "Number of concurrent area scraping workers"
  type        = number
  default     = 1
}

# Budget
variable "budget_amount" {
  description = "Monthly budget amount in JPY"
  type        = number
  default     = 1000
}

variable "notification_email" {
  description = "Email for budget notifications"
  type        = string
  default     = ""
}

# GitHub Actions (Workload Identity)
variable "github_repo" {
  description = "GitHub repository (owner/repo format)"
  type        = string
  default     = ""
}
