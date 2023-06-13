const express = require("express");
const bodyParser = require("body-parser");
const ejs = require("ejs");
const cookieParser = require ("cookie-parser")
const env = require("dotenv").config();
const https = require("https");

const app = express();

app.set("view engine", "ejs");
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(__dirname + "/public"));

// ENV VARIABLES FOR TESTING PURPOSES
// const username = process.env.loginName;
// const password = process.env.password;
// const accountId = process.env.accountId;
// const skillId = process.env.skillId;

function callApi(options, body){
    var body = body || null;

    return new Promise((resolve, reject) => {
        try {
            let req = https.request(options, function(res){
                let rawData = "";
                console.log("status code >>> ", res.statusCode);
                res.on("data", chunk => {
                    rawData += chunk;
                });

                res.on("end", () => {
                    const parsedData = JSON.parse(rawData);
                    resolve(parsedData, res.headers);
                });
            })

            if(body != null){
                req.write(body);
            }

            req.end();
        }
        catch(err){
            console.log("promise errored >>> ", err);
            reject(err);
        }
    })
};
    

app.route("/")
.get(function(req, res){
    res.render("home");
})

app.route("/login")
.post(async function(req, res){
    const accountId = req.body.accountId;
    const username = req.body.username;
    const password = req.body.password;

    const domainOptions = {
        host: "api.liveperson.net",
        path: "/api/account/" + accountId + "/service/agentVep/baseURI.json?version=1.0",
        method: "GET"
    };

    const domainResponse = await callApi(domainOptions);
    const domainURI = domainResponse.baseURI;

    const loginBody = {
        'username' : username,
        'password' : password
    };

    const loginOptions = {
        host: domainURI,
        path: "/api/account/" + accountId + "/login?v=1.3",
        method: "POST",
        headers: {
            'Content-Type' : 'application/json'
        },
    };

    const loginResponse = await callApi(loginOptions, JSON.stringify(loginBody));
    
    const bearer = loginResponse.bearer;
    const csrf = loginResponse.csrf;
    const sessionId = loginResponse.sessionId;

    let cookieOptions = { httpOnly: true, maxAge: 180000 };

    res.cookie("bearer", bearer, cookieOptions);
    res.cookie("csrf", csrf, cookieOptions);
    res.cookie("sessionId", sessionId, cookieOptions);
    res.cookie("accountId", accountId, cookieOptions);

    res.redirect("checkDependencies");
});

app.route("/checkDependencies")
.get(function(req, res){
    res.render("checkDependencies", { responseData: "none" });
})
.post(async function(req, res){
    // ALL APIS FOR THIS REQUEST USE DOMAIN accountConfigReadOnly, EXCEPT THE CAMPAIGN/ENGAGEMENTS REQUESTS WHICH HAVE THEIR HOST HARD-CODED.

    const skillId = req.body.skillId;
    const accountId = req.cookies.accountId;
    const dependency = req.body.dependency;
    const bearer = req.cookies.bearer;
    const sessionId = req.cookies.sessionId;
    const csrf = req.cookies.csrf;
    var responseData = "";

    const domainOptions = {
        host: "api.liveperson.net",
        path: "/api/account/" + accountId + "/service/accountConfigReadOnly/baseURI.json?version=1.0",
        method: "GET"
    };

    const domainResponse = await callApi(domainOptions);
    const baseURI = domainResponse.baseURI;

    switch (dependency) {
        case "PDC":
            
            const PDCOptions = {
                host: baseURI,
                path: "/api/account/" + accountId + "/configuration/engagement-window/canned-responses?v=2.0&select=skillIds,id",
                method: "GET",
                headers: {
                    "Authorization" : "Bearer " + bearer
                }
            }

            const PDCResponse = await callApi(PDCOptions);

            var filteredArr = PDCResponse.filter(object => object.skillIds);
            var finalArr = [];
            
            for(const x in filteredArr){
                const skillExists = value => filteredArr[x].skillIds.some(skill => skill == value);
                if (skillExists(skillId)) {
                    finalArr.push(filteredArr[x]);
                }
            }

            responseData = finalArr;

            break;
        case "automaticMessages":

            const automaticMessagesOptions = {
                host: baseURI,
                path: "/api/account/" + accountId + "/configuration/engagement-window/unified-auto-messages?v=2.0&select=skillId,id&context_type=SKILL&context_id=" + skillId,
                method: "GET",
                headers: {
                    "Authorization" : "Bearer " + bearer
                }
            };
            const autoMessagesResponse = await callApi(automaticMessagesOptions);
            var finalArr = autoMessagesResponse.filter(object => object.skillId);

            responseData = finalArr;

            break;
        case "users":

            const usersOptions = {
                host: baseURI,
                path: "/api/account/" + accountId + "/configuration/le-users/users?v=4.0&select=id,loginName,skillIds",
                method: "GET",
                headers: {
                    "Authorization" : "Bearer " + bearer
                }
            };
            const usersResponse = await callApi(usersOptions);
            var filteredArr = usersResponse.filter(object => object.skillIds);
            var finalArr = [];

            for (const x in filteredArr) {
                const userSkills = filteredArr[x].skillIds;
                const skillExists = value => userSkills.some(skill => skill == value);
                if (skillExists(skillId)) {
                    finalArr.push(filteredArr[x]);
                }
            };

            responseData = finalArr;

            break;
        case "skills":

            const skillsOptions = {
                host: baseURI,
                path: "/api/account/" + accountId + "/configuration/le-users/skills?v=4.0&select=id,name,skillTransferList",
                method: "GET",
                headers: {
                    "Authorization" : "Bearer " + bearer
                }
            };
            
            const skillsResponse = await callApi(skillsOptions);
            var filteredArr = skillsResponse.filter(object => object.skillTransferList);
            var finalArr = [];

            for (const x in filteredArr) {
                const skillTransfers = filteredArr[x].skillTransferList;
                const skillExists = value => skillTransfers.some(skill => skill == value);
                if (skillExists(skillId)){
                    finalArr.push(filteredArr[x]);
                }
            };

            responseData = finalArr;

            break;
        case "engagements":

            const campaignOptions = {
                host: "lo.ac.liveperson.net",
                path: "/api/account/" + accountId + "/configuration/le-campaigns/campaigns?v=3.4",
                method: "GET",
                headers: {
                    "Authorization" : "Bearer " + bearer
                }
            };

            const campaignResponse = await callApi(campaignOptions);
            var filteredArr = [];

            for (const x in campaignResponse) {
                const campaignId = campaignResponse[x].id;

                const engagementOptions = {
                    host: "lo.ac.liveperson.net",
                    path: "/api/account/" + accountId + "/configuration/le-campaigns/campaigns/" + campaignId + "?v=3.4",
                    method: "GET",
                    headers: {
                        "Authorization" : "Bearer " + bearer
                    }
                };

                const engagementResponse = await callApi(engagementOptions);
                const engagements = engagementResponse.engagements;

                for (const x in engagements) {
                    if (engagements[x].skillId == skillId) {
                        const matchedEngagement = {
                            campaignId: campaignId,
                            engagementId: engagements[x].id,
                            engagementName: engagements[x].name,
                            skillId : engagements[x].skillId
                        };
                        filteredArr.push(matchedEngagement);
                    }
                }
            }

            responseData = filteredArr;

            break;
        default:
            console.log("dependency was not provided");
            responseData = "none";
    }

    res.render("checkDependencies", { responseData: responseData, dependency: dependency });
});

app.listen(3000, function(){
    console.log("Server listening on port 3000.");
});