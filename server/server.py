import threading

from flask import Flask, request, send_file
from flask_cors import CORS, cross_origin

from os import path, listdir, remove, rename
from shutil import rmtree
import json
import base64

import cv2
from PIL import Image
from transforms import RGBTransform
import numpy as np

from auth import create_user, check_user
from img_process import add_photos
from m_timer import set_timer, cleanup_loop

def to_base64(file_name):
  data = ''
  with open(file_name , "rb") as image_file :
    data = base64.b64encode(image_file.read())
  return data.decode('utf-8')

def read_json(file_name):
  data = {}
  with open(file_name , "r") as json_file:
    data = json.load(json_file)
  return data

def files_in_dir(dir_name, include_path=True):
  files = [ f for f in listdir(dir_name) if path.isfile(path.join(dir_name, f)) ]
  if include_path:
    files = [ path.join(dir_name, f) for f in files ]
  return files

app = Flask(__name__)

@app.route('/fuck', methods=['GET'])
@cross_origin()
def fuck():
  return 'fuck'

@app.route('/create_user', methods=['POST'])
@cross_origin()
def create_user_and_send_uid():
  body = request.get_json(force=True)

  email = body['email']
  pwd = body['password']

  uid = create_user(email, pwd)

  print('new user', uid)

  if uid is None:
    return { "error": f'A user by the email address {email} already exists. Try logging in.' }, 401
  
  return { "uid": uid }

@app.route('/login_user', methods=['POST'])
@cross_origin()
def login_user_and_send_uid():
  body = request.get_json(force=True)

  email = body['email']
  pwd = body['password']

  uid = check_user(email, pwd)

  if uid is None:
    return { "error": "Invalid Login Credentials" }, 401
  
  return { "uid": uid }

@app.route('/upload_images', methods=['POST'])
@cross_origin()
def upload():
  if request.method == 'POST':
    
    batch_size = request.form.get('batch_size')
    id = request.form.get('id')

    if batch_size:
      fs = [request.files.get(str(i)) for i in range(int(batch_size))]
      
      print('FileStorage:', fs)
      print('filename:', [fl.filename for fl in fs])

      for fl in fs:
        fl.save(path.join('temp', fl.filename))
      
      add_photos(id=id)

      filelist = [ f for f in listdir('temp') if path.isfile(path.join('temp', f)) ]
      for f in filelist:
        remove(path.join('temp', f))

      return batch_size
    
    else:
      print('none')

  return 'use post request'

@app.route('/upload_mosaic_img', methods=['POST'])
@cross_origin()
def upload_mosaic_img():

  id = request.form.get('uid')
  mosaic_img = request.files.get('mosaicImg')

  if id and mosaic_img:

    save_path = path.join('out', id, 'mosaic.jpg')
    mosaic_img.save(save_path)

    MAX_STORED_DIM = 1000
    cv_img = cv2.imread(save_path)
    height, width, _ = cv_img.shape
    max_dim = max(height, width)

    if max_dim > MAX_STORED_DIM:
      factor = max_dim / MAX_STORED_DIM
      resized = cv2.resize(cv_img, ( int(width / factor), int(height / factor) ))
      cv2.imwrite(save_path, resized)

    set_timer(lambda: remove(save_path), 60 * 60)

    return id

  else:
    return {"error": "no id or mosaic image"}

@app.route('/get_mosaic_img', methods=['GET'])
@cross_origin()
def send_mosaic_img():

  id = request.args.get('uid')

  mosaic_img_path = path.join('out', id, 'mosaic.jpg')

  if not path.exists(mosaic_img_path):
    return { "error": "no mosaic image stored" }

  mosaic_img = to_base64(mosaic_img_path)

  return { "img": mosaic_img }

@app.route('/get_img_count', methods=['GET'])
@cross_origin()
def send_image_count():
  
  id = request.args.get('id')

  if not path.exists(path.join('out', id, 'imgs')):
    return '0'

  img_list = [ f for f in listdir(path.join('out', id, 'imgs')) if path.isfile(path.join('out', id, 'imgs', f)) ]

  return str(len(img_list))

@app.route('/get_images', methods=['GET'])
@cross_origin()
def send_images():
  print('got request')
  id = request.args.get('id')
  palette_type = request.args.get('palette') or 'avg'

  if id and path.exists(path.join('out', id, 'imgs')):
    img_list = [ f for f in listdir(path.join('out', id, 'imgs')) if path.isfile(path.join('out', id, 'imgs', f)) ]
    print('1')
    img_list = sorted(img_list, key = lambda f : int(f.split('.')[0]))
    print('2')
    img_list = [ path.join('out', id, 'imgs', f) for f in img_list ]
    print('3')
    img_list = list(map(to_base64, img_list))
    print('4')

    color_file = path.join('out', id, 'data', f'{palette_type}.json')
    colors = read_json(color_file)

    print('sending')

    return {
      "imgs": img_list,
      "colors": colors
    }

  else:
    return 'NONE'

@app.route('/remove_imgs', methods=['POST'])
@cross_origin()
def remove_images():
  body = request.get_json(force=True)
  id = body['id']
  to_remove = body['selected']

  img_path = path.join('out', id, 'imgs')
  
  img_files = files_in_dir(img_path, include_path=False)
  img_files = sorted(img_files, key = lambda f : int(f.split('.')[0]))
  img_files = [path.join(img_path, f) for f in img_files]

  if len(to_remove) == len(img_files):
    rmtree(path.join('out', id))
  
  else:

    for f in files_in_dir(path.join('out', id, 'data')):

      data = read_json(f)
      data = [ el for i, el in enumerate(data) if i not in to_remove ]

      with open(f, 'w') as out:
        json.dump(data, out)
    
    ind = 0

    for i, img in enumerate(img_files):
      if i in to_remove:
        remove(img)
      else:
        rename(img, path.join(img_path, f'{ind}.jpg'))
        ind += 1

  return 'DONE'

@app.route('/generate_mosaic', methods=['POST'])
@cross_origin()
def generate_mosaic():
  body = request.get_json(force=True)
  
  id = body['uid']
  id_map = body['idMap']
  tint_map = body['tintMap']
  tint_factor = body['tintFactor']

  bitmap = []

  for r in range(len(id_map)):
    row = []

    for c in range(len(id_map[r])):
      img_id = id_map[r][c]

      img = Image.open(path.join('out', id, 'imgs', f'{img_id}.jpg'))
      img = img.convert('RGB')

      tint_transform = RGBTransform().mix_with(tint_map[r][c], factor=tint_factor)
      tinted = tint_transform.applied_to(img)

      np_img = np.array(tinted)
      cv2_img = cv2.cvtColor(np_img, cv2.COLOR_RGB2BGR) 

      row.append(cv2_img)
    
    bitmap.append(row)

  rows = [ np.concatenate(row, axis=1) for row in bitmap ]
  img = np.concatenate(rows, axis=0)

  # cv2.imshow('img', img)

  out_path = path.join('out', id, 'final.jpg')

  cv2.imwrite(out_path, img)

  img_base64 = to_base64(out_path)

  remove(out_path)
  
  return { "img": img_base64 }

@app.route('/get_mosaic')
@cross_origin()
def send_mosaic():
  id = request.args.get('uid')

  return send_file(path.join('out', id, 'final.jpg'))


def server_loop():
  app.run('0.0.0.0', port=8814)
CORS(app, resources={r"*": {"origins": "*"}})

if __name__ == "__main__":

  kwargs = {'host': '0.0.0.0', 'port': 8814, 'use_reloader': False, 'debug': True}
  #threading.Thread(target=app.run, daemon=True, kwargs=kwargs).start()

  cleanup_thread = threading.Thread(target=cleanup_loop, daemon=True)
  cleanup_thread.start()

  app.run(**kwargs)


