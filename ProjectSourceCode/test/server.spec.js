// ********************** Initialize server **********************************

const server = require('../index'); //TODO: Make sure the path to your index.js is correctly added

// ********************** Import Libraries ***********************************

const chai = require('chai'); // Chai HTTP provides an interface for live integration testing of the API's.
const chaiHttp = require('chai-http');
chai.should();
chai.use(chaiHttp);
const {assert, expect} = chai;

// *********************** TODO: WRITE 2 UNIT TESTCASES **************************

// Example Positive Testcase :
// API: /add_user
// Input: {id: 5, name: 'John Doe', dob: '2020-02-20'}
// Expect: res.status == 200 and res.body.message == 'Success'
// Result: This test case should pass and return a status 200 along with a "Success" message.
// Explanation: The testcase will call the /add_user API with the following input
// and expects the API to return a status of 200 along with the "Success" message.

describe('Testing Register User API', () => {
    // --- Positive Test Case: Successful Registration ---
    it('positive : /register - successful registration', done => {
        chai
            .request(server)
            // Use a unique email/username that hasn't been used yet
            .post('/register')
            .send({username: 'test_pass_user', email: 'test_pass_email@test.com', password: '123'})
            .end((err, res) => {
                // Expect successful registration and redirection/render to login page
                expect(res).to.have.status(200);
                expect(res.text).to.include('Registration successful! Please log in.');
                done();
            });
    });

    // --- Negative Test Case 1: Missing Required Field ---
    it('negative : /register - missing password field', done => {
        chai
            .request(server)
            .post('/register')
            // Missing the 'password' field
            .send({username: 'incomplete_user', email: 'incomplete@email.com'})
            .end((err, res) => {
                // Expect 200 and the validation error message on the register page
                expect(res).to.have.status(200); 
                expect(res.text).to.include('All fields are required.');
                done();
            });
    });
});

// ********************************************************************************