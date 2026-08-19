import {pipeline} from 'node:stream';
import papaparse from 'papaparse';
import fs from 'fs-extra';

// A parsed CSV row: raw string cells, keyed by (renamed) column.
export type Row = Record<string, string>;

// A column named after an Object.prototype member is unsafe as a key.
function isSafeColumnName(name: string): boolean {
    return !(name in Object.prototype);
}

// headerMapping renames headers to the columns they emit under; unmapped columns
// carry through, and one mapped to an empty target is dropped.
export default function parse(path: string, headerMapping?: Record<string, string>): Promise<Row[]> {
    return new Promise(function (resolve, reject) {
        const csvFileStream = fs.createReadStream(path);
        const csvParserStream = papaparse.parse(papaparse.NODE_STREAM_INPUT, {
            header: true,
            skipEmptyLines: true
        });

        const rows: Row[] = [];
        const parsedCSVStream = pipeline(csvFileStream, csvParserStream, (err) => {
            if (err) {
                return reject(err);
            }
            resolve(rows);
        });

        parsedCSVStream.on('data', (parsedRow: Record<string, unknown>) => {
            // a throw here escapes as an uncaught exception and leaves this
            // promise forever unsettled, so it has to become a rejection
            try {
                const row: Row = {};

                for (const [header, value] of Object.entries(parsedRow)) {
                    // non-string values are papaparse's __parsed_extra overflow from ragged rows
                    if (typeof value !== 'string') {
                        continue;
                    }

                    // hasOwn: a prototype-named header must not match an inherited method on the mapping
                    if (headerMapping && Object.hasOwn(headerMapping, header)) {
                        if (!headerMapping[header]) {
                            continue;
                        }
                        row[headerMapping[header]] = value;
                    } else if (isSafeColumnName(header)) {
                        row[header] = value;
                    }
                }

                if (!Object.keys(row).length) {
                    return;
                }

                rows.push(row);
            } catch (err) {
                reject(err);
            }
        });
    });
}
