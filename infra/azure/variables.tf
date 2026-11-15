variable "name" {
  description = "Prefix for every resource. Keep it short and lowercase."
  type        = string
  default     = "cognexa"
}

variable "location" {
  description = "Region for the app, database and vault. UAE North is the closest Azure region to Saudi Arabia."
  type        = string
  default     = "uaenorth"
}

variable "openai_location" {
  description = "Region for Azure OpenAI, which is not offered in every region."
  type        = string
  default     = "swedencentral"
}

variable "chat_model" {
  description = "Azure OpenAI chat model and version to deploy."
  type = object({
    name     = string
    version  = string
    capacity = number
  })
  default = {
    name     = "gpt-4o-mini"
    version  = "2024-07-18"
    capacity = 10
  }
}

variable "embedding_model" {
  description = "Azure OpenAI embedding model and version to deploy."
  type = object({
    name     = string
    version  = string
    capacity = number
  })
  default = {
    name     = "text-embedding-3-small"
    version  = "1"
    capacity = 10
  }
}

variable "embedding_dimension" {
  description = "Vector size stored in pgvector. text-embedding-3 models can shorten their output to this."
  type        = number
  default     = 768
}

variable "github_repository" {
  description = "owner/repo allowed to deploy with OIDC. Empty disables it."
  type        = string
  default     = ""
}
