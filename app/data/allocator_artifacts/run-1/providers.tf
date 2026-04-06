terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azure = {
      source  = "hashicorp/azurerm"
      version = ">= 1.0.0"
    }
  }
}

provider "azure" {
  region = var.region
}
