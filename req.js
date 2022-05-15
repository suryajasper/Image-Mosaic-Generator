const unirest = require('unirest');

unirest
  .post("https://accounts.spotify.com/api/token")
  .headers({'Accept': 'application/json', 'Content-Type': 'application/json'})
  .send({
    "grant_type":    "authorization_code",
    "code":          code,
    "redirect_uri":  myurl,
    "client_secret": mysecret,
    "client_id":     myid,
  })
  .then(console.log, console.error);