CREATE TABLE `logs` (
    `id` INTEGER NOT NULL PRIMARY KEY AUTO_INCREMENT,
    `host` VARCHAR(40) NOT NULL,
    `user` VARCHAR(255),
    `time` DATETIME NOT NULL,
    `method` ENUM('GET', 'HEAD', 'POST', 'PUT', 'DELETE', 'CONNECT', 'OPTIONS', 'TRACE', 'PATCH'),
    `path` VARCHAR(255),
    `query` VARCHAR(255),
    `status` INTEGER NOT NULL,
    `response_size` INTEGER NOT NULL,
    `process_time` INTEGER NOT NULL,
    `referer` VARCHAR(255),
    `user_agent` VARCHAR(255),
    `is_bot` BOOLEAN NOT NULL,
    `browser` VARCHAR(32),
    `device_type` ENUM('other', 'mobile', 'unknown', 'console', 'tablet', 'smarttv', 'wearable', 'embedded'),
    `os` VARCHAR(255),
    `country` VARCHAR(8)
) CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
