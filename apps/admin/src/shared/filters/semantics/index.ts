// One vocabulary per file. Each says what a data type means in NQL and nothing about which
// field holds it; the registry pairs them with operators and a control, and the addressing
// decides where the value lives.

export * from './types';
export * from './operator-table';
export * from './text';
export * from './scalar';
export * from './set';
export * from './number';
export * from './date';
export * from './count';
export * from './none';
