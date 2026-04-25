CREATE DATABASE IF NOT EXISTS `shijing`
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE `shijing`;

CREATE TABLE IF NOT EXISTS `users` (
  `id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `account_id` VARCHAR(32) NOT NULL,
  `nickname` VARCHAR(100) NOT NULL,
  `password` VARCHAR(255) NOT NULL,
  `avatar` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uniq_account_id` (`account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `activity_logs` (
  `id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `level` VARCHAR(16) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `score` INT NULL,
  `related_type` VARCHAR(32) NULL,
  `related_id` VARCHAR(64) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_activity_logs_user_created` (`user_account_id`, `created_at`),
  KEY `idx_activity_logs_kind` (`kind`),
  KEY `idx_activity_logs_related` (`related_type`, `related_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `notifications` (
  `id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `kind` VARCHAR(24) NOT NULL,
  `level` VARCHAR(16) NOT NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `related_type` VARCHAR(32) NULL,
  `related_id` VARCHAR(64) NULL,
  `read_at` TIMESTAMP NULL DEFAULT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_notifications_user_read_created` (`user_account_id`, `read_at`, `created_at`),
  KEY `idx_notifications_kind` (`kind`),
  KEY `idx_notifications_related` (`related_type`, `related_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `user_preferences` (
  `user_account_id` VARCHAR(32) NOT NULL,
  `theme_preference` VARCHAR(16) NOT NULL DEFAULT 'system',
  `default_monitor_interval_seconds` INT UNSIGNED NOT NULL DEFAULT 8,
  `auto_create_task_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `notification_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `high_risk_alert_enabled` TINYINT(1) NOT NULL DEFAULT 1,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`user_account_id`),
  KEY `idx_user_preferences_theme` (`theme_preference`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `monitor_sessions` (
  `id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `device_name` VARCHAR(120) NOT NULL,
  `camera_label` VARCHAR(255) NULL,
  `status` VARCHAR(24) NOT NULL,
  `capture_interval_seconds` INT UNSIGNED NOT NULL DEFAULT 8,
  `baseline_score` INT NULL,
  `latest_score` INT NULL,
  `average_score` DECIMAL(6,2) NULL,
  `event_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `alert_count` INT UNSIGNED NOT NULL DEFAULT 0,
  `latest_event` TEXT NULL,
  `latest_action` TEXT NULL,
  `latest_snapshot` LONGTEXT NULL,
  `started_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ended_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_monitor_sessions_user` (`user_account_id`),
  KEY `idx_monitor_sessions_started_at` (`started_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `monitor_events` (
  `id` VARCHAR(64) NOT NULL,
  `session_id` VARCHAR(64) NOT NULL,
  `score` INT NOT NULL,
  `event_type` VARCHAR(24) NOT NULL,
  `risk_level` VARCHAR(16) NOT NULL,
  `change_label` VARCHAR(120) NOT NULL,
  `event` TEXT NOT NULL,
  `action` TEXT NOT NULL,
  `suggestions` LONGTEXT NOT NULL,
  `snapshot` LONGTEXT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_monitor_events_session` (`session_id`),
  KEY `idx_monitor_events_created_at` (`created_at`),
  CONSTRAINT `fk_monitor_events_session`
    FOREIGN KEY (`session_id`) REFERENCES `monitor_sessions`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `analysis_records` (
  `id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `score` INT NOT NULL,
  `event` TEXT NOT NULL,
  `action` TEXT NOT NULL,
  `suggestions` LONGTEXT NOT NULL,
  `image` LONGTEXT NULL,
  `task_id` VARCHAR(64) NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_analysis_records_user_created` (`user_account_id`, `created_at`),
  KEY `idx_analysis_records_score` (`score`),
  KEY `idx_analysis_records_task` (`task_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cleaning_tasks` (
  `id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `source_type` VARCHAR(24) NOT NULL,
  `source_id` VARCHAR(64) NULL,
  `title` VARCHAR(180) NOT NULL,
  `description` TEXT NOT NULL,
  `priority` VARCHAR(16) NOT NULL,
  `status` VARCHAR(24) NOT NULL DEFAULT 'pending',
  `score` INT NULL,
  `image` LONGTEXT NULL,
  `suggestions` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `completed_at` TIMESTAMP NULL DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_cleaning_tasks_user_status` (`user_account_id`, `status`),
  KEY `idx_cleaning_tasks_created_at` (`created_at`),
  KEY `idx_cleaning_tasks_source` (`source_type`, `source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `task_verifications` (
  `id` VARCHAR(64) NOT NULL,
  `task_id` VARCHAR(64) NOT NULL,
  `user_account_id` VARCHAR(32) NOT NULL,
  `before_score` INT NULL,
  `after_score` INT NOT NULL,
  `score_delta` INT NULL,
  `before_image` LONGTEXT NULL,
  `after_image` LONGTEXT NOT NULL,
  `before_summary` TEXT NULL,
  `after_summary` TEXT NOT NULL,
  `after_action` TEXT NOT NULL,
  `after_suggestions` LONGTEXT NOT NULL,
  `created_at` TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_task_verifications_task_created` (`task_id`, `created_at`),
  KEY `idx_task_verifications_user_created` (`user_account_id`, `created_at`),
  CONSTRAINT `fk_task_verifications_task`
    FOREIGN KEY (`task_id`) REFERENCES `cleaning_tasks`(`id`)
    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
