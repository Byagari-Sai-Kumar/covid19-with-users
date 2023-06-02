const express = require("express");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
app.use(express.json());
const dbPath = path.join(__dirname, "covid19IndiaPortal.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(8000, () => {
      console.log("Server Running at http://localhost:8000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};

initializeDBAndServer();

const objectSnakeToCamel = (newObject) => {
  return {
    stateId: newObject.state_id,
    stateName: newObject.state_name,
    population: newObject.population,
  };
};

const districtSnakeToCamel = (newObject) => {
  return {
    districtId: newObject.district_id,
    districtName: newObject.district_name,
    stateId: newObject.state_id,
    cases: newObject.cases,
    cured: newObject.cured,
    active: newObject.active,
    deaths: newObject.deaths,
  };
};

const reportSnakeToCamelCase = (newObject) => {
  return {
    totalCases: newObject.cases,
    totalCured: newObject.cured,
    totalActive: newObject.active,
    totalDeaths: newObject.deaths,
  };
};
//Authenticate TokenAPI
const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeaders = request.headers["authorization"];

  if (authHeaders !== undefined) {
    jwtToken = authHeaders.split(" ")[1];

    jwt.verify(jwtToken, "my_secret_message", async (error, payload) => {
      if (error) {
        respnse.status(401);
        response.send("Invalid JWT Token");
      } else {
        next();
      }
    });
  } else {
    response.status(401);
    response.send("Invalid JWT Token");
  }
};

//User Login API
app.post("/login/", async (request, response) => {
  const { username, password } = request.body;

  const getUserDetailsQuery = `
    SELECT
    *
    FROM
    user
    WHERE
    username = '${username}';`;

  const dbUser = await db.get(getUserDetailsQuery);

  if (dbUser === undefined) {
    response.status(400);
    response.send("Invalid user");
  } else {
    //checking password
    const isPasswordCorrect = await bcrypt.compare(password, dbUser.password);

    if (isPasswordCorrect) {
      const payload = { username: username };

      const jwtToken = jwt.sign(payload, "my_secret_message");

      response.send(jwtToken);
    } else {
      response.status(400);
      response.send("Invalid password");
    }
  }
});

//get states API1
app.get("/states/", authenticateToken, async (request, response) => {
  const getStatesQuery = `
    SELECT
    *
    FROM 
    state;`;

  const states = await db.all(getStatesQuery);

  const statesResult = states.map((eachObject) => {
    return objectSnakeToCamel(eachObject);
  });
  response.send(statesResult);
});

//get single state API2
app.get("/states/:stateId/", authenticateToken, async (request, response) => {
  const { stateId } = request.params;

  const getStateQuery = `
    SELECT
    *
    FRO
    state
    WHERE 
    state_id = ${stateId};`;

  try {
    const state = await db.get(getStateQuery);

    const stateResult = objectSnakeToCamel(state);
    response.send(stateResult);
  } catch (error) {
    console.log(error.message);
  }
});

//create district API3
app.post("/districts/", authenticateToken, async (request, response) => {
  const districtDetails = request.body;

  const {
    districtName,
    stateId,
    cases,
    cured,
    active,
    deaths,
  } = districtDetails;

  const addDistrictQuery = `
    INSERT INTO district
    (district_name,state_id,cases,cured,active,deaths)
    VALUES
    ('${districtName}',
        ${stateId},
        ${cases},
        ${cured},
        ${active},
        ${deaths});`;

  await db.run(addDistrictQuery);

  response.send("District Successfully Added");
});

//get district API4
app.get(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getDistrictQuery = `
    SELECT
    *
    FROM
    district
    WHERE
    district_id = ${districtId};`;

    const district = await db.get(getDistrictQuery);

    const districtResult = districtSnakeToCamel(district);

    response.send(districtResult);
  }
);

//delete district API5
app.delete(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const deleteDistrictQuery = `
    DELETE FROM
    district
    WHERE 
    district_id = ${districtId};`;

    await db.run(deleteDistrictQuery);

    response.send("District Removed");
  }
);

//update district API6
app.put(
  "/districts/:districtId/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const districtDetails = request.body;

    const {
      districtName,
      stateId,
      cases,
      cured,
      active,
      deaths,
    } = districtDetails;

    const updateDistrictQuery = `
    UPDATE 
    district
    SET
    district_name = '${districtName}',
    state_id = ${stateId},
    cases = ${cases},
    cured = ${cured},
    active = ${active},
    deaths = ${deaths}
    WHERE 
    district_id = ${districtId};`;

    await db.run(updateDistrictQuery);

    response.send("District Details Updated");
  }
);

//get statistics of cases API7
app.get(
  "/states/:stateId/stats/",
  authenticateToken,
  async (request, response) => {
    const { stateId } = request.params;

    const getStatisticsQuery = `
    SELECT
    SUM(cases) AS cases,
    SUM(cured) AS cured,
    SUM(active) AS active,
    SUM(deaths) AS deaths
    FROM
    district
    WHERE 
    state_id = ${stateId};`;

    const statistics = await db.get(getStatisticsQuery);

    const resultReport = reportSnakeToCamelCase(statistics);

    response.send(resultReport);
  }
);

//get district name API8
app.get(
  "/districts/:districtId/details/",
  authenticateToken,
  async (request, response) => {
    const { districtId } = request.params;

    const getDistrictNameQuery = `
    SELECT
    state_name 
    FROM
    state
    INNER JOIN district
    ON state.state_id = district.state_id
    WHERE 
        district.district_id = ${districtId};`;

    const stateName = await db.get(getDistrictNameQuery);

    response.send({ stateName: stateName.state_name });
  }
);

module.exports = app;
