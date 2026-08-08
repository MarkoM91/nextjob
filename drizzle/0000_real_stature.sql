CREATE TABLE `application_emails` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text NOT NULL,
	`subject` text NOT NULL,
	`body` text NOT NULL,
	`tone` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_application_emails_user` ON `application_emails` (`user_id`);--> statement-breakpoint
CREATE TABLE `application_status_history` (
	`id` text PRIMARY KEY NOT NULL,
	`application_id` text NOT NULL,
	`from_status` text,
	`to_status` text NOT NULL,
	`changed_by_user_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`changed_by_user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_application_status_history_application` ON `application_status_history` (`application_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `applications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`status` text NOT NULL,
	`notes` text,
	`application_date` text,
	`deadline` text,
	`interview_date` text,
	`recruiter_contact_encrypted` text,
	`reminder_at` text,
	`next_action` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_applications_user_job` ON `applications` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_applications_user_status` ON `applications` (`user_id`,`status`);--> statement-breakpoint
CREATE TABLE `ats_reports` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`document_version_id` text NOT NULL,
	`job_id` text NOT NULL,
	`overall_score` integer NOT NULL,
	`required_coverage` integer NOT NULL,
	`preferred_coverage` integer NOT NULL,
	`formatting_score` integer NOT NULL,
	`factual_integrity_score` integer NOT NULL,
	`warnings_json` text NOT NULL,
	`methodology_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`document_version_id`) REFERENCES `document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_ats_reports_user_created` ON `ats_reports` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `audit_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text,
	`actor_id` text,
	`action` text NOT NULL,
	`resource_type` text NOT NULL,
	`resource_id` text,
	`metadata_json` text DEFAULT '{}' NOT NULL,
	`ip_hash` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_audit_logs_user_created` ON `audit_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `idx_audit_logs_resource` ON `audit_logs` (`resource_type`,`resource_id`);--> statement-breakpoint
CREATE TABLE `candidate_certifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`issuer` text,
	`issued_at` text,
	`expires_at` text,
	`source_fact_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_certifications_user` ON `candidate_certifications` (`user_id`);--> statement-breakpoint
CREATE TABLE `candidate_education` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`institution` text NOT NULL,
	`degree` text,
	`field` text,
	`start_date` text,
	`end_date` text,
	`source_fact_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_education_user` ON `candidate_education` (`user_id`);--> statement-breakpoint
CREATE TABLE `candidate_experiences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`company` text NOT NULL,
	`role` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`bullets_json` text DEFAULT '[]' NOT NULL,
	`source_fact_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_experiences_user_dates` ON `candidate_experiences` (`user_id`,`start_date`);--> statement-breakpoint
CREATE TABLE `candidate_facts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`cv_id` text,
	`fact_type` text NOT NULL,
	`value_json` text NOT NULL,
	`source_text` text NOT NULL,
	`confidence` real NOT NULL,
	`verification_status` text DEFAULT 'pending' NOT NULL,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`cv_id`) REFERENCES `uploaded_cvs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_facts_user_type` ON `candidate_facts` (`user_id`,`fact_type`);--> statement-breakpoint
CREATE TABLE `candidate_languages` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`language_code` text NOT NULL,
	`proficiency` text NOT NULL,
	`source_fact_id` text,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_languages_user_language` ON `candidate_languages` (`user_id`,`language_code`);--> statement-breakpoint
CREATE TABLE `candidate_projects` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`description` text,
	`url` text,
	`skills_json` text DEFAULT '[]' NOT NULL,
	`source_fact_ids_json` text DEFAULT '[]' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_candidate_projects_user` ON `candidate_projects` (`user_id`);--> statement-breakpoint
CREATE TABLE `candidate_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`level` text DEFAULT 'unspecified' NOT NULL,
	`source_fact_id` text,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_candidate_skills_user_name` ON `candidate_skills` (`user_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `cover_letters` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text NOT NULL,
	`current_version` integer DEFAULT 1 NOT NULL,
	`tone` text NOT NULL,
	`content` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_cover_letters_user` ON `cover_letters` (`user_id`);--> statement-breakpoint
CREATE TABLE `deletion_requests` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`scope` text NOT NULL,
	`status` text NOT NULL,
	`requested_at` text NOT NULL,
	`scheduled_for` text NOT NULL,
	`completed_at` text,
	`audit_log_id` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`audit_log_id`) REFERENCES `audit_logs`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_deletion_requests_status_scheduled` ON `deletion_requests` (`status`,`scheduled_for`);--> statement-breakpoint
CREATE TABLE `document_claim_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`document_version_id` text NOT NULL,
	`claim_text` text NOT NULL,
	`candidate_fact_id` text,
	`source_bullet_id` text,
	`supported` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_version_id`) REFERENCES `document_versions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`candidate_fact_id`) REFERENCES `candidate_facts`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_document_claim_sources_version` ON `document_claim_sources` (`document_version_id`);--> statement-breakpoint
CREATE TABLE `document_versions` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`version` integer NOT NULL,
	`content` text NOT NULL,
	`change_summary` text,
	`model_name` text,
	`prompt_version` text,
	`validation_result_json` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`document_id`) REFERENCES `generated_documents`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_document_versions_document_version` ON `document_versions` (`document_id`,`version`);--> statement-breakpoint
CREATE TABLE `generated_documents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text,
	`job_id` text NOT NULL,
	`document_type` text NOT NULL,
	`language_code` text NOT NULL,
	`source_cv_id` text,
	`current_version` integer DEFAULT 1 NOT NULL,
	`object_key` text,
	`model_name` text NOT NULL,
	`prompt_version` text NOT NULL,
	`validation_status` text NOT NULL,
	`ats_estimate` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`source_cv_id`) REFERENCES `uploaded_cvs`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_generated_documents_user_created` ON `generated_documents` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `interview_preparation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`application_id` text NOT NULL,
	`content_json` text NOT NULL,
	`model_name` text NOT NULL,
	`prompt_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`application_id`) REFERENCES `applications`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_interview_preparation_user` ON `interview_preparation` (`user_id`);--> statement-breakpoint
CREATE TABLE `job_duplicates` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_job_id` text NOT NULL,
	`duplicate_job_id` text NOT NULL,
	`confidence` real NOT NULL,
	`reasons_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`canonical_job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`duplicate_job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_duplicates_pair` ON `job_duplicates` (`canonical_job_id`,`duplicate_job_id`);--> statement-breakpoint
CREATE TABLE `job_matches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`score` integer NOT NULL,
	`band` text NOT NULL,
	`eligible` integer NOT NULL,
	`weights_version` text NOT NULL,
	`calculated_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_matches_user_job` ON `job_matches` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_job_matches_user_score` ON `job_matches` (`user_id`,`score`);--> statement-breakpoint
CREATE TABLE `job_providers` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`enabled` integer DEFAULT true NOT NULL,
	`countries_json` text DEFAULT '[]' NOT NULL,
	`languages_json` text DEFAULT '[]' NOT NULL,
	`rate_limit_per_minute` integer DEFAULT 30 NOT NULL,
	`last_healthy_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_providers_name` ON `job_providers` (`name`);--> statement-breakpoint
CREATE TABLE `job_requirements` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`kind` text NOT NULL,
	`value` text NOT NULL,
	`normalized_value` text NOT NULL,
	`mandatory` integer NOT NULL,
	`confidence` real NOT NULL,
	`evidence` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_job_requirements_job_kind` ON `job_requirements` (`job_id`,`kind`);--> statement-breakpoint
CREATE TABLE `job_skills` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`name` text NOT NULL,
	`normalized_name` text NOT NULL,
	`mandatory` integer NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_skills_job_name` ON `job_skills` (`job_id`,`normalized_name`);--> statement-breakpoint
CREATE TABLE `job_sources` (
	`id` text PRIMARY KEY NOT NULL,
	`job_id` text NOT NULL,
	`raw_job_id` text,
	`provider_id` text NOT NULL,
	`external_id` text NOT NULL,
	`source_url` text NOT NULL,
	`is_employer_direct` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`raw_job_id`) REFERENCES `raw_jobs`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`provider_id`) REFERENCES `job_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_job_sources_provider_external` ON `job_sources` (`provider_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `idx_job_sources_job` ON `job_sources` (`job_id`);--> statement-breakpoint
CREATE TABLE `match_explanations` (
	`id` text PRIMARY KEY NOT NULL,
	`match_id` text NOT NULL,
	`explanation` text NOT NULL,
	`matched_skills_json` text NOT NULL,
	`gaps_json` text NOT NULL,
	`breakdown_json` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`match_id`) REFERENCES `job_matches`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_match_explanations_match` ON `match_explanations` (`match_id`);--> statement-breakpoint
CREATE TABLE `normalized_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`canonical_url` text,
	`title` text NOT NULL,
	`normalized_title` text NOT NULL,
	`company` text NOT NULL,
	`normalized_company` text NOT NULL,
	`company_domain` text,
	`country_code` text NOT NULL,
	`region` text,
	`city` text,
	`location_text` text NOT NULL,
	`workplace` text NOT NULL,
	`employment_type` text NOT NULL,
	`seniority` text,
	`salary_min` integer,
	`salary_max` integer,
	`salary_currency` text,
	`salary_period` text,
	`normalized_annual_min_eur` integer,
	`normalized_annual_max_eur` integer,
	`salary_estimated` integer DEFAULT false NOT NULL,
	`description_original` text NOT NULL,
	`description_sanitized` text NOT NULL,
	`source_language` text,
	`published_at` text,
	`expires_at` text,
	`first_seen_at` text NOT NULL,
	`last_seen_at` text NOT NULL,
	`content_hash` text NOT NULL,
	`active` integer DEFAULT true NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_normalized_jobs_feed` ON `normalized_jobs` (`active`,`country_code`,`published_at`);--> statement-breakpoint
CREATE INDEX `idx_normalized_jobs_title_company` ON `normalized_jobs` (`normalized_title`,`normalized_company`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_normalized_jobs_content_hash` ON `normalized_jobs` (`content_hash`);--> statement-breakpoint
CREATE TABLE `notification_consents` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`destination_encrypted` text,
	`status` text NOT NULL,
	`consented_at` text,
	`revoked_at` text,
	`policy_version` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_consents_user_channel` ON `notification_consents` (`user_id`,`channel`);--> statement-breakpoint
CREATE TABLE `notification_logs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`channel` text NOT NULL,
	`template` text NOT NULL,
	`deep_link_token_hash` text NOT NULL,
	`provider_message_id` text,
	`status` text NOT NULL,
	`failure_code` text,
	`sent_at` text,
	`opened_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_notification_logs_user_created` ON `notification_logs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `notification_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`email_frequency` text DEFAULT 'weekly' NOT NULL,
	`strong_match_only` integer DEFAULT true NOT NULL,
	`quiet_hours_start` text,
	`quiet_hours_end` text,
	`time_zone` text DEFAULT 'UTC' NOT NULL,
	`daily_cap` integer DEFAULT 2 NOT NULL,
	`weekly_cap` integer DEFAULT 8 NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_notification_preferences_user` ON `notification_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `provider_sync_runs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`status` text NOT NULL,
	`started_at` text NOT NULL,
	`finished_at` text,
	`imported_count` integer DEFAULT 0 NOT NULL,
	`rejected_count` integer DEFAULT 0 NOT NULL,
	`duplicate_count` integer DEFAULT 0 NOT NULL,
	`error_code` text,
	`attempt` integer DEFAULT 1 NOT NULL,
	`dead_lettered_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `job_providers`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_provider_sync_runs_provider_started` ON `provider_sync_runs` (`provider_id`,`started_at`);--> statement-breakpoint
CREATE TABLE `raw_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`provider_id` text NOT NULL,
	`external_id` text NOT NULL,
	`payload_json` text NOT NULL,
	`payload_hash` text NOT NULL,
	`fetched_at` text NOT NULL,
	`processed_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`provider_id`) REFERENCES `job_providers`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_raw_jobs_provider_external_hash` ON `raw_jobs` (`provider_id`,`external_id`,`payload_hash`);--> statement-breakpoint
CREATE INDEX `idx_raw_jobs_unprocessed` ON `raw_jobs` (`processed_at`);--> statement-breakpoint
CREATE TABLE `rejected_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`reason` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_rejected_jobs_user_job` ON `rejected_jobs` (`user_id`,`job_id`);--> statement-breakpoint
CREATE TABLE `saved_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`job_id` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`job_id`) REFERENCES `normalized_jobs`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_saved_jobs_user_job` ON `saved_jobs` (`user_id`,`job_id`);--> statement-breakpoint
CREATE INDEX `idx_saved_jobs_user_created` ON `saved_jobs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `subscriptions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`provider_customer_id` text,
	`plan` text DEFAULT 'free' NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`period_ends_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_subscriptions_user` ON `subscriptions` (`user_id`);--> statement-breakpoint
CREATE TABLE `uploaded_cvs` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`object_key` text NOT NULL,
	`file_name` text NOT NULL,
	`mime_type` text NOT NULL,
	`size_bytes` integer NOT NULL,
	`sha256` text NOT NULL,
	`status` text NOT NULL,
	`parser_version` text,
	`consented_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_uploaded_cvs_user_created` ON `uploaded_cvs` (`user_id`,`created_at`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_uploaded_cvs_user_hash` ON `uploaded_cvs` (`user_id`,`sha256`);--> statement-breakpoint
CREATE TABLE `user_preferences` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`countries_json` text DEFAULT '[]' NOT NULL,
	`cities_json` text DEFAULT '[]' NOT NULL,
	`workplace_json` text DEFAULT '[]' NOT NULL,
	`target_titles_json` text DEFAULT '[]' NOT NULL,
	`excluded_titles_json` text DEFAULT '[]' NOT NULL,
	`employment_types_json` text DEFAULT '[]' NOT NULL,
	`minimum_salary` integer,
	`salary_currency` text,
	`relocation` integer DEFAULT false NOT NULL,
	`visa_sponsorship_required` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_preferences_user` ON `user_preferences` (`user_id`);--> statement-breakpoint
CREATE TABLE `user_profiles` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`full_name` text,
	`phone_encrypted` text,
	`location` text,
	`current_role` text,
	`years_experience` real,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_user_profiles_user` ON `user_profiles` (`user_id`);--> statement-breakpoint
CREATE TABLE `users` (
	`id` text PRIMARY KEY NOT NULL,
	`email` text NOT NULL,
	`display_name` text,
	`locale` text DEFAULT 'en' NOT NULL,
	`role` text DEFAULT 'user' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`deleted_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_users_email` ON `users` (`email`);--> statement-breakpoint
CREATE TABLE `work_authorizations` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`country_code` text NOT NULL,
	`status` text NOT NULL,
	`source_fact_id` text,
	`verified_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `uq_work_authorizations_user_country` ON `work_authorizations` (`user_id`,`country_code`);--> statement-breakpoint
PRAGMA optimize;
