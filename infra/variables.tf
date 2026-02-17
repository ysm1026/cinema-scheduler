variable "project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "region" {
  description = "GCP region"
  type        = string
  default     = "asia-northeast1"
}

variable "billing_account_id" {
  description = "GCP Billing Account ID (for budget alert)"
  type        = string
  default     = ""
}

# Cloud Run Service
variable "mcp_image" {
  description = "MCP server container image URL"
  type        = string
}

variable "mcp_max_instances" {
  description = "Max instances for MCP Cloud Run Service"
  type        = number
  default     = 3
}

variable "mcp_cpu" {
  description = "CPU allocation for MCP service"
  type        = string
  default     = "1"
}

variable "mcp_memory" {
  description = "Memory allocation for MCP service"
  type        = string
  default     = "512Mi"
}

# Cloud Run Job (Scraper)
variable "scraper_image" {
  description = "Scraper container image URL"
  type        = string
}

variable "scraper_cpu" {
  description = "CPU allocation for scraper job"
  type        = string
  default     = "2"
}

variable "scraper_memory" {
  description = "Memory allocation for scraper job"
  type        = string
  default     = "2Gi"
}

variable "scraper_max_retries" {
  description = "Max retries for scraper job"
  type        = number
  default     = 1
}

variable "scrape_schedule" {
  description = "Cron schedule for scraper (in JST timezone)"
  type        = string
  default     = "0 6 * * *"
}

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
  default     = 3
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
