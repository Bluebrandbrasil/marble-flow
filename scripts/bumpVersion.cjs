const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function getGitHash() {
    try {
        return execSync('git rev-parse --short HEAD').toString().trim();
    } catch (e) {
        return '';
    }
}

function generateBuildId() {
    return 'mf-' + Math.random().toString(36).substring(2, 6);
}

const versionData = {
    version: new Date().toISOString().replace(/\.\d+Z$/, '').replace('T', ' '),
    buildId: generateBuildId(),
    commit: getGitHash()
};

const publicDir = path.join(__dirname, '..', 'public');
if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
}

const versionFile = path.join(publicDir, 'version.json');
fs.writeFileSync(versionFile, JSON.stringify(versionData, null, 2));

console.log('--- Version Bumped ---');
console.log(`Version: ${versionData.version}`);
console.log(`Build ID: ${versionData.buildId}`);
console.log(`Commit: ${versionData.commit}`);
console.log('---------------------');
