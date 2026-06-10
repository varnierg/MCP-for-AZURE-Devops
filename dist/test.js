"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// Author Varnier Gatto and Gemini, e-mail: mcp_dev@jitime.com
const config_1 = require("./config");
const crypto_1 = require("./crypto");
const updater_1 = require("./docs/updater");
let passedTests = 0;
let failedTests = 0;
function assert(condition, testName) {
    if (condition) {
        console.log(`[PASS] ${testName}`);
        passedTests++;
    }
    else {
        console.error(`[FAIL] ${testName}`);
        failedTests++;
    }
}
function testUrlParser() {
    console.log('\n--- Testing URL Parser ---');
    const case1 = (0, config_1.parseProjectUrl)('https://dev.azure.com/my-org/Test');
    assert(case1.organization === 'my-org' && case1.project === 'Test', 'Parses basic dev.azure.com url');
    const case2 = (0, config_1.parseProjectUrl)('https://dev.azure.com/my-org/Test/_dashboards/dashboard/5db7b103-5d66-4e9c-b935-a9d013a409a6');
    assert(case2.organization === 'my-org' && case2.project === 'Test', 'Parses complex dashboard url');
    const case3 = (0, config_1.parseProjectUrl)('https://my-org.visualstudio.com/TestProject');
    assert(case3.organization === 'my-org' && case3.project === 'TestProject', 'Parses legacy visualstudio.com url');
    const case4 = (0, config_1.parseProjectUrl)('https://my-org.visualstudio.com/DefaultCollection/TestProject/');
    assert(case4.organization === 'my-org' && case4.project === 'TestProject', 'Parses legacy DefaultCollection url');
}
function testCrypto() {
    console.log('\n--- Testing Cryptography ---');
    let key = (0, crypto_1.getEncryptionKey)();
    if (!key) {
        key = (0, crypto_1.generateAndSaveKey)();
        console.log('Generated a new test key in user profile.');
    }
    const secret = 'my-secret-pat-token-12345';
    const encrypted = (0, crypto_1.encrypt)(secret, key);
    const decrypted = (0, crypto_1.decrypt)(encrypted, key);
    assert(decrypted === secret, 'Encryption/Decryption roundtrip matches original text');
    assert(encrypted !== secret, 'Cipher text is obfuscated');
}
function testConfigurationStore() {
    console.log('\n--- Testing Configuration & Multi-Org support ---');
    const testUrl1 = 'https://dev.azure.com/my-org/TestProject1';
    const testUrl2 = 'https://dev.azure.com/my-org/TestProject2';
    const testUrl3 = 'https://dev.azure.com/anotherorg/ProjectX';
    const user = 'test-user@email.com';
    const token1 = 'token-for-my-org';
    const token2 = 'token-for-anotherorg';
    // 1. Add first project
    (0, config_1.addProjectConfig)(testUrl1, user, token1);
    const creds1 = (0, config_1.getCredentialsForProject)('TestProject1', 'my-org');
    assert(creds1 !== null && creds1.username === user && creds1.pat === token1, 'Saves and retrieves first project');
    // 2. Add second project in the SAME organization - should reuse credentials
    // Simulate the setup process checking if organization already has credentials
    const config = (0, config_1.loadConfig)();
    assert(config !== null && config.organizations['my-org'] !== undefined, 'Organization my-org has credentials stored');
    // Link second project
    (0, config_1.addProjectConfig)(testUrl2, config.organizations['my-org'].username, config.organizations['my-org'].pat);
    const creds2 = (0, config_1.getCredentialsForProject)('TestProject2', 'my-org');
    assert(creds2 !== null && creds2.username === user && creds2.pat === token1, 'Reuses credentials for second project of same organization');
    // 3. Add third project in DIFFERENT organization
    (0, config_1.addProjectConfig)(testUrl3, user, token2);
    const creds3 = (0, config_1.getCredentialsForProject)('ProjectX', 'anotherorg');
    assert(creds3 !== null && creds3.username === user && creds3.pat === token2, 'Saves credentials for new organization');
}
function testLocalDatabaseSearch() {
    console.log('\n--- Testing Local Database Search ---');
    const results = (0, updater_1.searchLocalDatabase)('workitems');
    assert(results.length > 0, 'Retrieves work item APIs by keyword');
    const gitResults = (0, updater_1.searchLocalDatabase)('pullrequests', 'git');
    assert(gitResults.length > 0 && gitResults.every(r => r.area === 'git'), 'Retrieves Git pull request APIs with area filter');
}
function runAllTests() {
    try {
        testUrlParser();
        testCrypto();
        testConfigurationStore();
        testLocalDatabaseSearch();
        console.log(`\n======================================`);
        console.log(`Test Execution Finished:`);
        console.log(`PASSED: ${passedTests}`);
        console.log(`FAILED: ${failedTests}`);
        console.log(`======================================\n`);
        if (failedTests > 0) {
            process.exit(1);
        }
    }
    catch (e) {
        console.error('Test suite crashed with error:', e);
        process.exit(1);
    }
}
runAllTests();
