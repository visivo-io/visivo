// const { Client } = require('pg');

// const pgclient = new Client({
//     host: process.env.POSTGRES_HOST,
//     port: process.env.POSTGRES_PORT,
//     user: 'postgres',
//     password: 'postgres',
//     database: 'postgres'
// });


// const table = 'CREATE TABLE IF NOT EXISTS test_table(id SERIAL PRIMARY KEY, x INT, y INT)';
// const text = 'INSERT INTO test_table(x, y) VALUES($1, $2) RETURNING *';

// const records = [
//     [1, 1], [2, 1], [3, 2], [4, 3], [5, 5], [6, 8]
// ];

// pgclient.connect();

// pgclient.query(table, (err, res) => {
//     if (err) throw err
// });

// records.forEach(record => {
//     pgclient.query(text, record, (err, res) => {
//         if (err) throw err;
//         console.log('Inserted:', res.rows[0]);
//     });
// });


// pgclient.end();
const { Client } = require('pg');

const pgclient = new Client({
    host: process.env.POSTGRES_HOST,
    port: process.env.POSTGRES_PORT,
    user: 'postgres',
    password: 'postgres',
    database: 'postgres'
});

pgclient.connect();

const table = 'CREATE TABLE student(id SERIAL PRIMARY KEY, firstName VARCHAR(40) NOT NULL, lastName VARCHAR(40) NOT NULL, age INT, address VARCHAR(80), email VARCHAR(40))'
const text = 'INSERT INTO student(firstname, lastname, age, address, email) VALUES($1, $2, $3, $4, $5) RETURNING *'
const values = ['Mona the', 'Octocat', 9, '88 Colin P Kelly Jr St, San Francisco, CA 94107, United States', 'octocat@github.com']

pgclient.query(table, (err, res) => {
    if (err) throw err
});

pgclient.query(text, values, (err, res) => {
    if (err) throw err
});

pgclient.query('SELECT * FROM student', (err, res) => {
    if (err) throw err
    console.log(err, res.rows) // Print the data in student table
    pgclient.end()
});
