locals {
  architecture_type = "web_application"
  default_tags = {
    "cost_center" = "engineering"
    "env" = "staging"
    "owner" = "platform-team"
    "project" = "allocator-ui"
  }
}

resource "terraform_data" "allocator_metadata" {
  input = {
    architecture_type = local.architecture_type
    default_tags      = local.default_tags
  }
}

resource "terraform_data" "web_application_baseline" {
  input = {
    service_name               = "web_application baseline"
    purpose                    = "Approved estimate placeholder"
    estimated_monthly_cost_usd = 420.0
  }
}
