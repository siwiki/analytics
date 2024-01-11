#!/usr/bin/env node
'use strict';

import {createReadStream} from 'node:fs';
import {copyFile, readFile, truncate} from 'node:fs/promises';
import {isIP} from 'node:net';
import {argv} from 'node:process';
import {createInterface} from 'node:readline';
import {WebhookClient} from 'discord.js';
import isbot from 'isbot';
import {createPool} from 'mysql2/promise';
import UAParser from 'ua-parser-js';

const VALID_HTTP_METHODS = [
    'GET',
    'HEAD',
    'POST',
    'PUT',
    'DELETE',
    'CONNECT',
    'OPTIONS',
    'TRACE',
    'PATCH',
    // Apache's way of telling us "no method".
    '-'
];
// 444, 497, 498, 499 are Nginx-specific
const VALID_HTTP_STATUSES = [
    100, 101, 102, 103, 200, 201, 202, 203, 204, 206, 207, 208, 226, 300, 301,
    302, 303, 304, 307, 308, 400, 401, 402, 403, 404, 405, 406, 407, 408, 409,
    410, 411, 412, 413, 414, 415, 416, 417, 418, 421, 422, 423, 424, 425, 426,
    428, 429, 431, 444, 450, 451, 497, 498, 499, 500, 501, 502, 503, 504, 505,
    506, 507, 508, 510, 511
]
const MAX_PATH_QUERY_LENGTH = 255;
const MAX_COUNTRY_LENGTH = 8;
const QUERY = `
INSERT INTO logs (host, user, time, method, path, query, status, response_size,
process_time, referer, user_agent, is_bot, browser, device_type, os, country)
VALUES ?
`;
const CHUNK_SIZE = 20000;

async function loadConfig() {
    return JSON.parse(await readFile('config.json', {
        encoding: 'utf-8'
    }));
}

async function fixEscaping(line) {
    return line.replaceAll(/\\x([0-9a-fA-F]{2})/g, '%$1');
}

async function gracefulParse(json) {
    try {
        return JSON.parse(json);
    } catch (error) {
        throw new Error('Invalid JSON.');
    }
}

async function checkFieldsAreStrings(object) {
    for (const [key, value] of Object.entries(object)) {
        if (typeof value !== 'string') {
            throw new Error(`Field '${key}' is not a string.`);
        }
    }
    return object;
}

async function checkValidIP(object) {
    if (!isIP(object.host)) {
        throw new Error(`Invalid IP address: ${object.host}`);
    }
    return object;
}

async function checkValidTime(object) {
    const time = new Date(object.time);
    if (isNaN(time)) {
        throw new Error(`Invalid time: ${object.time}`);
    }
    return {
        ...object,
        time
    };
}

async function checkValidMethod(object) {
    const method = object.method.toUpperCase();
    if (!VALID_HTTP_METHODS.includes(method)) {
        throw new Error(`Invalid HTTP method: ${method}`);
    }
    return {
        ...object,
        method: method === '-' ?
            null :
            method
    };
}

async function checkPathQuery(object) {
    const path = decodeURI(object.path).slice(0, MAX_PATH_QUERY_LENGTH);
    const query = decodeURI(object.query).slice(0, MAX_PATH_QUERY_LENGTH);
    return {
        ...object,
        path: (path === '-') ? null : path,
        query: (query === '') ? null : query
    };
}

async function checkStatus(object) {
    const status = Number(object.status);
    if (!VALID_HTTP_STATUSES.includes(status)) {
        throw new Error(`Invalid HTTP status: ${object.status}`);
    }
    return {
        ...object,
        status
    };
}

async function checkResponseSize(object) {
    const responseSize = Number(object.responseSize);
    if (isNaN(responseSize)) {
        throw new Error(`Invalid response size: ${object.responseSize}`);
    }
    return {
        ...object,
        responseSize
    };
}

async function checkProcessTime(object) {
    const processTime = Number(object.processTime);
    if (isNaN(processTime)) {
        throw new Error(`Invalid response size: ${object.processTime}`);
    }
    return {
        ...object,
        processTime
    };
}

async function trimReferer(object) {
    const referer = object.referer.slice(0, MAX_PATH_QUERY_LENGTH);
    return {
        ...object,
        referer
    };
}

async function trimUser(object) {
    const user = object.user.slice(0, MAX_PATH_QUERY_LENGTH);
    return {
        ...object,
        user: user === '-' ? null : user
    };
}

async function checkCountry(object) {
    return {
        ...object,
        country: (object.country === '-') ?
            null :
            object.country.slice(0, MAX_COUNTRY_LENGTH).toUpperCase()
    };
}

async function decomposeUserAgent(object) {
    if (object.userAgent === '-' || !object.userAgent) {
        return {
            ...object,
            bot: false,
            browser: null,
            deviceType: 'unknown',
            os: null,
            userAgent: null
        };
    }
    const bot = isbot(object.userAgent);
    const userAgent = new UAParser(object.userAgent).getResult();
    const browser = userAgent.browser.name || null;
    const os = userAgent.os.name ?
        userAgent.os.version ?
            `${userAgent.os.name} ${userAgent.os.version}` :
            userAgent.os.name :
        null;
    const deviceType = bot ?
        'unknown' :
        (userAgent.device.type || 'other');
    return {
        ...object,
        bot,
        browser,
        deviceType,
        os,
        userAgent: object.userAgent.slice(0, MAX_PATH_QUERY_LENGTH)
    };
}

async function loadEntries(path) {
    const fileStream = createReadStream(path);
    const readline = createInterface({
        crlfDelay: Infinity,
        input: fileStream
    });
    const successful = [];
    const failed = [];
    for await (const line of readline) {
        if (!line.trim()) {
            // Skip empty lines.
            continue;
        }
        try {
            successful.push(
                await fixEscaping(line)
                    .then(gracefulParse)
                    .then(checkFieldsAreStrings)
                    .then(checkValidIP)
                    .then(checkValidTime)
                    .then(checkValidMethod)
                    .then(checkPathQuery)
                    .then(checkStatus)
                    .then(checkResponseSize)
                    .then(checkProcessTime)
                    .then(trimReferer)
                    .then(trimUser)
                    .then(checkCountry)
                    .then(decomposeUserAgent)
            );
        } catch (error) {
            failed.push({
                error: error && error.message || 'Unknown error.',
                line
            });
        }
    }
    return [successful, failed];
}

async function report(webhook, message) {
    console.info(new Date(), message);
    try {
        await webhook.send({
            content: message.slice(0, 2000)
        });
    } catch (error) {
        // I guess there's nothing to be done here.
        console.error(new Date(), 'Webhook error:', error);
    }
}

async function reportFailedEntries(webhook, entries) {
    if (entries.length === 0) {
        return;
    }
    const formattedEntries = entries
        .slice(0, 5)
        .map(({error, line}, index) => `${index + 1}. Error: ${error}, line:\n\`\`\`json\n${line}\`\`\``)
        .join('');
    await report(webhook, `${entries.length} entries failed, first 5 are displayed:\n${formattedEntries}`);
    if (entries.length > 5) {
        console.debug('All failed entries:', entries);
    }
}

async function insertEntries(db, entries) {
    const pool = createPool(db);
    for (let start = 0; start < entries.length; start += CHUNK_SIZE) {
        const batch = entries.slice(start, start + CHUNK_SIZE);
        await pool.query(QUERY, [batch.map(e => [
            e.host,
            e.user,
            e.time,
            e.method,
            e.path,
            e.query,
            e.status,
            e.responseSize,
            e.processTime,
            e.referer,
            e.userAgent,
            e.bot,
            e.browser,
            e.deviceType,
            e.os,
            e.country
        ])]);
    }
    await pool.end();
}

async function main() {
    const {backup, db, discord, path} = await loadConfig();
    const webhook = new WebhookClient(discord);
    const doTruncate = !argv.includes('--no-truncate');
    const doInsert = !argv.includes('--no-insert');
    try {
        await report(webhook, 'Log transfer started.');
        // Backup access log in case something goes wrong.
        if (doTruncate) {
            await copyFile(path, backup);
        }
        // Parse all entries.
        const [entries, failedEntries] = await loadEntries(path);
        // Truncate the file, so we fetch unparsed entries next time.
        if (doTruncate) {
            await truncate(path);
        }
        // If any entries failed, report them.
        await reportFailedEntries(webhook, failedEntries);
        // Insert entries into the database.
        if (doInsert) {
            await insertEntries(db, entries);
        }
        // Report success.
        await report(webhook, `${entries.length} entries successfully transferred.`);
    } catch (error) {
        // Report error and exit.
        await report(webhook, `Log transfer failed: ${error.message}`);
        console.error('Full error:', error);
        process.exit(1);
    }
    webhook.destroy();
}

main();
