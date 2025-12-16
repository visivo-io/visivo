CREATE DATABASE IF NOT EXISTS visivo;

DROP TABLE IF EXISTS visivo.test_table;

CREATE TABLE visivo.test_table (
    id UInt32,
    x Int32,
    y Int32
) ENGINE = MergeTree()
ORDER BY id;

INSERT INTO visivo.test_table (id, x, y) VALUES
    (1, 1, 1),
    (2, 2, 1),
    (3, 3, 2),
    (4, 4, 3),
    (5, 5, 5),
    (6, 6, 8);

DROP TABLE IF EXISTS visivo.second_test_table;

CREATE TABLE visivo.second_test_table (
    id UInt32,
    x Int32,
    y Int32
) ENGINE = MergeTree()
ORDER BY id;

INSERT INTO visivo.second_test_table (id, x, y) VALUES
    (1, 1, 2),
    (2, 2, 2),
    (3, 3, 4),
    (4, 4, 6),
    (5, 5, 10),
    (6, 6, 16);
