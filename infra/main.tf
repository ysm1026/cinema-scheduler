terraform {
  required_version = ">= 1.5"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 7.19"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

provider "google" {
  alias                 = "billing"
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
}

data "google_project" "current" {}

# --- APIs ---
resource "google_project_service" "apis" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "cloudscheduler.googleapis.com",
    "secretmanager.googleapis.com",
    "cloudbilling.googleapis.com",
    "billingbudgets.googleapis.com",
    "pubsub.googleapis.com",
    "cloudfunctions.googleapis.com",
    "cloudbuild.googleapis.com",
    "eventarc.googleapis.com",
    "iamcredentials.googleapis.com",
    "iam.googleapis.com",
  ])
  service            = each.key
  disable_on_destroy = false
}

# --- Artifact Registry ---
resource "google_artifact_registry_repository" "main" {
  location      = var.region
  repository_id = "cinema-scheduler"
  format        = "DOCKER"
  depends_on    = [google_project_service.apis]
}

# --- GCS Bucket ---
resource "google_storage_bucket" "data" {
  name                        = "cinema-scheduler-${var.project_id}"
  location                    = var.region
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      num_newer_versions = 3
    }
    action {
      type = "Delete"
    }
  }

  versioning {
    enabled = true
  }
}

# --- Secret Manager ---
resource "google_secret_manager_secret" "api_keys" {
  secret_id = "cinema-scheduler-api-keys"
  replication {
    auto {}
  }
  depends_on = [google_project_service.apis]
}

# --- Service Accounts ---
resource "google_service_account" "mcp" {
  account_id   = "cinema-mcp"
  display_name = "Cinema Scheduler MCP Service"
}

resource "google_service_account" "scraper" {
  account_id   = "cinema-scraper"
  display_name = "Cinema Scheduler Scraper Job"
}

resource "google_service_account" "scheduler" {
  account_id   = "cinema-scheduler-trigger"
  display_name = "Cinema Scheduler Cloud Scheduler Trigger"
}

# --- IAM: MCP service account ---
resource "google_storage_bucket_iam_member" "mcp_gcs_reader" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectViewer"
  member = "serviceAccount:${google_service_account.mcp.email}"
}

resource "google_secret_manager_secret_iam_member" "mcp_secret_accessor" {
  secret_id = google_secret_manager_secret.api_keys.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.mcp.email}"
}

# --- IAM: Scraper service account ---
resource "google_storage_bucket_iam_member" "scraper_gcs_writer" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.scraper.email}"
}

# --- IAM: Scheduler → Cloud Run Job invoker ---
resource "google_cloud_run_v2_job_iam_member" "scheduler_invoker" {
  name     = google_cloud_run_v2_job.scraper.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler.email}"
}

# --- Cloud Run Service (MCP) ---
resource "google_cloud_run_v2_service" "mcp" {
  name                = "cinema-mcp"
  location            = var.region
  deletion_protection = true
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.mcp.email

    scaling {
      min_instance_count = 0
      max_instance_count = var.mcp_max_instances
    }

    max_instance_request_concurrency = 80
    timeout                          = "30s"

    containers {
      image = var.mcp_image

      ports {
        container_port = 8080
      }

      resources {
        limits = {
          cpu    = var.mcp_cpu
          memory = var.mcp_memory
        }
        cpu_idle = true
      }

      env {
        name  = "CLOUD_STORAGE_BUCKET"
        value = google_storage_bucket.data.name
      }

      startup_probe {
        http_get {
          path = "/health"
          port = 8080
        }
        initial_delay_seconds = 2
        period_seconds        = 3
        failure_threshold     = 10
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# パブリックアクセス許可（API キーで認証するため allUsers を許可）
resource "google_cloud_run_v2_service_iam_member" "mcp_public" {
  name     = google_cloud_run_v2_service.mcp.name
  location = var.region
  role     = "roles/run.invoker"
  member   = "allUsers"
}

# --- Cloud Run Job (Scraper) ---
resource "google_cloud_run_v2_job" "scraper" {
  name                = "cinema-scraper"
  location            = var.region
  deletion_protection = false

  template {
    task_count = 1

    template {
      service_account = google_service_account.scraper.email
      max_retries     = var.scraper_max_retries
      timeout         = "86400s"

      containers {
        image = var.scraper_image

        resources {
          limits = {
            cpu    = var.scraper_cpu
            memory = var.scraper_memory
          }
        }

        env {
          name  = "CLOUD_STORAGE_BUCKET"
          value = google_storage_bucket.data.name
        }

        env {
          name  = "SCRAPE_DAYS"
          value = tostring(var.scrape_days)
        }

        dynamic "env" {
          for_each = var.scrape_areas != "" ? [var.scrape_areas] : []
          content {
            name  = "SCRAPE_AREAS"
            value = env.value
          }
        }

        env {
          name  = "SCRAPE_CONCURRENCY"
          value = tostring(var.scrape_concurrency)
        }
      }
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Cloud Scheduler ---
resource "google_cloud_scheduler_job" "scraper_trigger" {
  name      = "cinema-scraper-daily"
  schedule  = var.scrape_schedule
  time_zone = "Asia/Tokyo"
  region    = var.region

  http_target {
    http_method = "POST"
    uri         = "https://${var.region}-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/${var.project_id}/jobs/${google_cloud_run_v2_job.scraper.name}:run"

    oauth_token {
      service_account_email = google_service_account.scheduler.email
    }
  }

  depends_on = [google_project_service.apis]
}

# --- Budget Alert ---
resource "google_pubsub_topic" "budget_alerts" {
  name       = "budget-alerts"
  depends_on = [google_project_service.apis]
}

resource "google_billing_budget" "monthly" {
  provider = google.billing
  count    = var.billing_account_id != "" ? 1 : 0

  billing_account = var.billing_account_id
  display_name    = "Cinema Scheduler Monthly Budget"

  budget_filter {
    projects = ["projects/${data.google_project.current.number}"]
  }

  amount {
    specified_amount {
      currency_code = "JPY"
      units         = tostring(var.budget_amount)
    }
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    pubsub_topic                    = google_pubsub_topic.budget_alerts.id
    schema_version                  = "1.0"
    enable_project_level_recipients = true
  }
}

# --- Budget Shutdown Function ---
resource "google_service_account" "budget_shutdown" {
  account_id   = "budget-shutdown-fn"
  display_name = "Budget Shutdown Cloud Function"
}

resource "google_project_iam_member" "budget_shutdown_run_admin" {
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.budget_shutdown.email}"
}

resource "google_project_iam_member" "budget_shutdown_scheduler_admin" {
  project = var.project_id
  role    = "roles/cloudscheduler.admin"
  member  = "serviceAccount:${google_service_account.budget_shutdown.email}"
}

resource "google_project_iam_member" "budget_shutdown_sa_user" {
  project = var.project_id
  role    = "roles/iam.serviceAccountUser"
  member  = "serviceAccount:${google_service_account.budget_shutdown.email}"
}

data "archive_file" "budget_shutdown" {
  type        = "zip"
  source_dir  = "${path.module}/functions/budget-shutdown"
  output_path = "${path.module}/.terraform/tmp/budget-shutdown.zip"
}

resource "google_storage_bucket_object" "budget_shutdown_source" {
  name   = "functions/budget-shutdown-${data.archive_file.budget_shutdown.output_md5}.zip"
  bucket = google_storage_bucket.data.name
  source = data.archive_file.budget_shutdown.output_path
}

resource "google_cloudfunctions2_function" "budget_shutdown" {
  name        = "budget-shutdown"
  location    = var.region
  description = "Shuts down Cloud Run and Scheduler when budget is exceeded"

  build_config {
    runtime     = "python312"
    entry_point = "handle_budget_notification"

    source {
      storage_source {
        bucket = google_storage_bucket.data.name
        object = google_storage_bucket_object.budget_shutdown_source.name
      }
    }
  }

  service_config {
    available_memory               = "256Mi"
    timeout_seconds                = 120
    max_instance_count             = 1
    min_instance_count             = 0
    service_account_email          = google_service_account.budget_shutdown.email
    all_traffic_on_latest_revision = true
    ingress_settings               = "ALLOW_INTERNAL_ONLY"

    environment_variables = {
      GCP_PROJECT_ID    = var.project_id
      GCP_REGION        = var.region
      CLOUD_RUN_SERVICE = google_cloud_run_v2_service.mcp.name
      SCHEDULER_JOB     = google_cloud_scheduler_job.scraper_trigger.name
    }
  }

  event_trigger {
    trigger_region        = var.region
    event_type            = "google.cloud.pubsub.topic.v1.messagePublished"
    pubsub_topic          = google_pubsub_topic.budget_alerts.id
    retry_policy          = "RETRY_POLICY_DO_NOT_RETRY"
    service_account_email = google_service_account.budget_shutdown.email
  }

  depends_on = [
    google_project_service.apis,
    google_storage_bucket_object.budget_shutdown_source,
  ]
}

# --- Workload Identity Federation (GitHub Actions CI/CD) ---
resource "google_service_account" "github_actions" {
  count        = var.github_repo != "" ? 1 : 0
  account_id   = "github-actions-deploy"
  display_name = "GitHub Actions Deploy"
}

resource "google_iam_workload_identity_pool" "github" {
  count                     = var.github_repo != "" ? 1 : 0
  workload_identity_pool_id = "github-actions"
  display_name              = "GitHub Actions"
  depends_on                = [google_project_service.apis]
}

resource "google_iam_workload_identity_pool_provider" "github" {
  count                              = var.github_repo != "" ? 1 : 0
  workload_identity_pool_id          = google_iam_workload_identity_pool.github[0].workload_identity_pool_id
  workload_identity_pool_provider_id = "github-oidc"
  display_name                       = "GitHub OIDC"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.actor"      = "assertion.actor"
    "attribute.repository" = "assertion.repository"
  }

  attribute_condition = "assertion.repository == \"${var.github_repo}\""

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

# GitHub Actions SA → Artifact Registry writer
resource "google_artifact_registry_repository_iam_member" "github_ar_writer" {
  count      = var.github_repo != "" ? 1 : 0
  location   = google_artifact_registry_repository.main.location
  repository = google_artifact_registry_repository.main.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# GitHub Actions SA → Cloud Run admin (deploy service)
resource "google_project_iam_member" "github_run_admin" {
  count   = var.github_repo != "" ? 1 : 0
  project = var.project_id
  role    = "roles/run.admin"
  member  = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# GitHub Actions SA → act as Cloud Run service accounts
resource "google_service_account_iam_member" "github_act_as_mcp" {
  count              = var.github_repo != "" ? 1 : 0
  service_account_id = google_service_account.mcp.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions[0].email}"
}

resource "google_service_account_iam_member" "github_act_as_scraper" {
  count              = var.github_repo != "" ? 1 : 0
  service_account_id = google_service_account.scraper.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.github_actions[0].email}"
}

# WIF → GitHub Actions SA impersonation
resource "google_service_account_iam_member" "github_wif_binding" {
  count              = var.github_repo != "" ? 1 : 0
  service_account_id = google_service_account.github_actions[0].name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github[0].name}/attribute.repository/${var.github_repo}"
}
