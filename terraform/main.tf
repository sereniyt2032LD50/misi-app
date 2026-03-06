terraform {
  required_version = ">= 1.0.0"
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Enable required APIs
resource "google_project_service" "services" {
  for_each = toset([
    "run.googleapis.com",
    "artifactregistry.googleapis.com",
    "aiplatform.googleapis.com",
    "iam.googleapis.com",
    "secretmanager.googleapis.com"
  ])
  service            = each.key
  disable_on_destroy = false
}

# Artifact Registry for Docker images
resource "google_artifact_registry_repository" "repo" {
  depends_on    = [google_project_service.services]
  location      = var.region
  repository_id = "misi-repo"
  description   = "Docker repository for Misi Safety Assistant"
  format        = "DOCKER"
}

# Service Account for Cloud Run
resource "google_service_account" "run_sa" {
  account_id   = "misi-runner"
  display_name = "Misi Cloud Run Service Account"
}

# Grant Vertex AI access to the service account
resource "google_project_iam_member" "vertex_ai_user" {
  project = var.project_id
  role    = "roles/aiplatform.user"
  member  = "serviceAccount:${google_service_account.run_sa.email}"
}

# Cloud Run Service
resource "google_cloud_run_v2_service" "misi" {
  name     = "misi-service"
  location = var.region
  ingress  = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.run_sa.email
    containers {
      image = "${var.region}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.repo.repository_id}/misi:latest"
      
      ports {
        container_port = 3000
      }

      env {
        name  = "NODE_ENV"
        value = "production"
      }
      env {
        name  = "GCP_PROJECT_ID"
        value = var.project_id
      }
      env {
        name  = "GCP_LOCATION"
        value = var.region
      }
      # Secrets should ideally be pulled from Secret Manager
      # This is a placeholder for environment variables
      env {
        name  = "APP_URL"
        value = var.app_url
      }
    }
  }

  depends_on = [google_project_service.services]
}

# Allow public access (optional, based on your needs)
resource "google_cloud_run_v2_service_iam_member" "public_access" {
  location = google_cloud_run_v2_service.misi.location
  name     = google_cloud_run_v2_service.misi.name
  role     = "roles/run.invoker"
  member   = "allUsers"
}
