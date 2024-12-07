const path = require("path");
const {MongoClient, ServerApiVersion} = require('mongodb');
const express = require("express");
const {MovieDb} = require('moviedb-promise');
const bodyParser = require("body-parser");
require("dotenv").config({path: path.resolve(__dirname, '.env')});

const apiKey = process.env.TMDB_API_KEY;
const moviedb = new MovieDb(apiKey);

const uri = process.env.MONGO_CONNECTION_STRING;
const db = process.env.MONGO_DB_NAME;
const collection = process.env.MONGO_COLLECTION;
const client = new MongoClient(uri, {serverApi: ServerApiVersion.v1});
const app = express();
const portNumber = process.argv[2];
app.listen(portNumber);
process.stdout.write(`http://localhost:${portNumber}`);

app.use(bodyParser.urlencoded({extended:true}));
app.use(express.static(path.join(__dirname, 'public')));
app.set("views", path.resolve(__dirname, "templates"));
app.set("view engine", "ejs");

let currentUserQueries = [];
let optionPage = 0;

app.get("/", (req, res) => {
    optionPage = 0;
    const searchBar = "<input type=\"text\" placeholder=\"Enter the film/TV show...\" id=\"titleInput\" name=\"title\">";
    res.render("index", {options: "", searchBar: searchBar, nextPage: "", lastPage: ""});
});

app.post("/", async (req, res) => {
    const itemRes = await moviedb.searchMulti(req.body.title);
    const buttonClicked = req.body.action;
    const resLen = itemRes.results.length;
    let i = 0;
    if (buttonClicked === "NEXT PAGE") {
        i = 8 * ++optionPage;
    } else if (buttonClicked === "LAST PAGE") {
        i = 8 * --optionPage;
    } else {
        optionPage = 0;
    }
    const searchBar = `<input type=\"text\" value=\"${req.body.title}\" id=\"titleInput\" name=\"title\">`;
    let j_max = (resLen > 8) ? 8 : resLen;
    let list_html="";
    for (j=0; j<j_max; j++) {
        while (i < resLen && itemRes.results[i].media_type === "person") {i++};
        if (i < resLen) {
            const item = itemRes.results[i];
            const title = (item.media_type === "movie") ? item.title : item.name;
            const posterPath = item.poster_path;
            list_html += `<a href="/results?fs=1&media=${item.media_type}&id=${item.id}&page=0"><h4 class="option-title">${title}</h4><img src="https://image.tmdb.org/t/p/w154${posterPath}"></a>\n`;
            i++;
        } else {
            j = j_max;
        }
    }
    if (list_html === "") {
        list_html = `<h4>No films/shows found for \"${req.body.title}\". Make sure to check your spelling, but our database is also not exhaustive. Sorry!</h4>`;
    }

    const moreDis = (resLen - i > 0) ? "" : " disabled";
    const more = `<input type="submit" id="more" name="action" value="NEXT PAGE"${moreDis}>`;
    const lastDis = (optionPage > 0) ? "" : " disabled";
    const last = `<input id="less" type="submit" name="action" value="LAST PAGE"${lastDis}>`;

    res.render("index", {options: list_html, searchBar: searchBar, lastPage: last, nextPage: more});
})

app.get("/results", async (req, res) => {
    if (req.query.fs == "1") {
        await updateDB(req.query.media, parseInt(req.query.id));
    }
    const id = req.query.id;
    let vars = {
        title: "",
        text: ""
    }
    try {
        let infoRes, credsRes;
        if (req.query.media === "movie") {
            infoRes = await moviedb.movieInfo(id);
            credsRes = await moviedb.movieCredits(id);
            vars.title = infoRes.title;
        } else {
            infoRes = await moviedb.tvInfo(id);
            credsRes = await moviedb.tvCredits(id);
            vars.title = infoRes.name; 
        }
        const cast = credsRes.cast;
        let castShow = cast.slice(0 + 5*req.query.page, 5 + 5*req.query.page);
        let odd = true;
        for (const actor of castShow) {
            const charName = actor.character ? actor.character : "--";
            vars.text += `<div class="actor-tile, ${odd ? "odd" : "even"}"><h3>${charName}</h3><img src="https://image.tmdb.org/t/p/w185${actor.profile_path}" alt="Profile image"><h4>${actor.name}</h4>\n\t<div class="list">\n`;
            const filmogRes = await moviedb.personCombinedCredits(actor.id);
            const filmog = filmogRes.cast.sort((a, b) => {
                a_date = (a.media_type === "movie") ? a.release_date : a.first_air_date;
                b_date = (b.media_type === "movie") ? b.release_date : b.first_air_date;
                return b_date.localeCompare(a_date);
            });
            for (const work of filmog) {
                let year, title;
                if (work.media_type === "movie") {
                    year = work.release_date.substring(0, 4);
                    title = work.title;
                } else {
                    year = work.first_air_date.substring(0, 4);
                    title = work.name;
                };
                if (title) {
                    let ind = JSON.stringify(currentUserQueries).indexOf(JSON.stringify([work.media_type, work.id]));
                    let ex = (ind != -1) ? " class=\"searched\"" : "";
                    vars.text += `\t\t<a${ex} href="/results?fs=0&media=${work.media_type}&id=${work.id}&page=0">${title} (${year ? year : "n.d."})</a>\n`;
                }
            };
            vars.text += "\t</div>\n</div>\n";
            odd = !odd;
        };
    } catch (e) {
        console.log(e);
        process.exit(0);
    };
    res.render("results", vars);
});

async function updateDB(media, id) {
    const ipRes = await fetch("https://api.ipify.org?format=json");
    const data = await ipRes.json();
    const filter = {ip: data.ip};
    await client.connect();
    const result = await client.db(db).collection(collection).findOne(filter);
    if (result) {
    fromSearch = true
        const searched = await client.db(db).collection(collection).findOne({
            _id: result._id,
            queries: [media, id]
        });
        if (!searched) {
            currentUserQueries = result.queries.concat([[media, id]]);
            await client.db(db).collection(collection).updateOne(
                filter,
                {$set: {'queries': result.queries.concat([[media, id]])}}
            );
        } else {
            currentUserQueries = result.queries;
        }
    } else {
        const user = {
            ip: data.ip,
            queries: [[media, id]]
        }
        currentUserQueries = user.queries;
        await client.db(db).collection(collection).insertOne(user);
    }
    await client.close();
}