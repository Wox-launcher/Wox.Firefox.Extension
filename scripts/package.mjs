// Packages dist/ into an AMO-ready zip.
// Paths inside the archive always use forward slashes. Windows
// Compress-Archive stores backslashes, which AMO rejects
// ("Invalid file name in archive: js\background.js").
import {existsSync, readFileSync, readdirSync, statSync, writeFileSync} from "node:fs";
import {join, relative} from "node:path";
import {deflateRawSync} from "node:zlib";

const distDir = join(process.cwd(), "dist");
const zipPath = join(process.cwd(), "wox-firefox-extension.zip");

if (!existsSync(distDir)) {
    console.error("dist/ directory not found. Run 'npm run build' first.");
    process.exit(1);
}

const files = listFiles(distDir);
if (files.length === 0) {
    console.error("dist/ directory is empty. Run 'npm run build' first.");
    process.exit(1);
}

writeZip(zipPath, files);

const sizeKB = Math.round(statSync(zipPath).size / 1024);
console.log(`\nBuilt and packaged: wox-firefox-extension.zip (${sizeKB} KB)`);
for (const file of files) {
    console.log(`  ${file.name}`);
}

function listFiles(root) {
    const files = [];
    const walk = (dir) => {
        for (const entry of readdirSync(dir, {withFileTypes: true})) {
            const fullPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                walk(fullPath);
                continue;
            }
            files.push({
                fullPath,
                name: relative(root, fullPath).split("\\").join("/"),
            });
        }
    };
    walk(root);
    return files.sort((a, b) => a.name.localeCompare(b.name));
}

function writeZip(outPath, files) {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const file of files) {
        const data = readFileSync(file.fullPath);
        const compressed = deflateRawSync(data);
        const name = Buffer.from(file.name, "utf8");
        const crc = crc32(data);
        const local = Buffer.concat([
            zipHeader(0x04034b50, name.length, compressed.length, data.length, crc),
            name,
            compressed,
        ]);
        const central = Buffer.concat([
            zipCentral(name.length, compressed.length, data.length, crc, offset),
            name,
        ]);
        localParts.push(local);
        centralParts.push(central);
        offset += local.length;
    }

    const central = Buffer.concat(centralParts);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(central.length, 12);
    end.writeUInt32LE(offset, 16);

    writeFileSync(outPath, Buffer.concat([...localParts, central, end]));
}

function zipHeader(signature, nameLength, compressedSize, uncompressedSize, crc) {
    const header = Buffer.alloc(30);
    header.writeUInt32LE(signature, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(0, 6);
    header.writeUInt16LE(8, 8);
    header.writeUInt16LE(0, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt32LE(crc, 14);
    header.writeUInt32LE(compressedSize, 18);
    header.writeUInt32LE(uncompressedSize, 22);
    header.writeUInt16LE(nameLength, 26);
    header.writeUInt16LE(0, 28);
    return header;
}

function zipCentral(nameLength, compressedSize, uncompressedSize, crc, offset) {
    const header = Buffer.alloc(46);
    header.writeUInt32LE(0x02014b50, 0);
    header.writeUInt16LE(20, 4);
    header.writeUInt16LE(20, 6);
    header.writeUInt16LE(0, 8);
    header.writeUInt16LE(8, 10);
    header.writeUInt16LE(0, 12);
    header.writeUInt16LE(0, 14);
    header.writeUInt32LE(crc, 16);
    header.writeUInt32LE(compressedSize, 20);
    header.writeUInt32LE(uncompressedSize, 24);
    header.writeUInt16LE(nameLength, 28);
    header.writeUInt16LE(0, 30);
    header.writeUInt16LE(0, 32);
    header.writeUInt16LE(0, 34);
    header.writeUInt16LE(0, 36);
    header.writeUInt32LE(0, 38);
    header.writeUInt32LE(offset, 42);
    return header;
}

function crc32(buf) {
    let crc = 0xffffffff;
    for (let i = 0; i < buf.length; i++) {
        crc ^= buf[i];
        for (let j = 0; j < 8; j++) {
            crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
        }
    }
    return (crc ^ 0xffffffff) >>> 0;
}
