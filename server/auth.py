import bcrypt
import json
import secrets

def read_json(file_name):
  data = {}
  with open(file_name , "r") as json_file:
    data = json.load(json_file)
  return data

def hash_password(password, rounds=12):

  salt = bcrypt.gensalt(rounds=rounds)

  hashed = bcrypt.hashpw( str.encode(password), salt )

  return hashed, salt

def check_password(password, hashed):

  return bcrypt.checkpw( str.encode(password), hashed )

def create_user(email, password):
  
  database = read_json('users.json')

  for user in database:
    if user['email'] == email:
      return None

  hashed, salt = hash_password(password)
  
  uid = secrets.token_hex(14)

  database.append({
    "email": email,
    "uid": uid,
    "hash": bytes.decode(hashed),
    "salt": bytes.decode(salt),
  })

  with open('users.json', 'w') as out:
    json.dump(database, out)
  
  return uid

def check_user(email, password):
  database = read_json('users.json')

  for user in database:
    if user['email'] == email and check_password(password, str.encode(user['hash'])):
      return user['uid']
  
  return None



