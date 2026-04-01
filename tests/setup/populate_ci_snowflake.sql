CREATE DATABASE IF NOT EXISTS JARED_DEV;
USE DATABASE JARED_DEV;
CREATE SCHEMA IF NOT EXISTS DEFAULT;
USE SCHEMA DEFAULT;

DROP TABLE IF EXISTS test_table;
CREATE TABLE test_table(x INT, y INT);

INSERT INTO test_table(x, y) VALUES(1, 1);
INSERT INTO test_table(x, y) VALUES(2, 1);
INSERT INTO test_table(x, y) VALUES(3, 2);
INSERT INTO test_table(x, y) VALUES(4, 3);
INSERT INTO test_table(x, y) VALUES(5, 5);
INSERT INTO test_table(x, y) VALUES(6, 8);

DROP TABLE IF EXISTS second_test_table;
CREATE TABLE second_test_table(x INT, y INT);

INSERT INTO second_test_table(x, y) VALUES(1, 2);
INSERT INTO second_test_table(x, y) VALUES(2, 2);
INSERT INTO second_test_table(x, y) VALUES(3, 4);
INSERT INTO second_test_table(x, y) VALUES(4, 6);
INSERT INTO second_test_table(x, y) VALUES(5, 10);
INSERT INTO second_test_table(x, y) VALUES(6, 16);
