import time
from uuid import uuid1

start_times = {}

def set_timer(callback, seconds):
  id = uuid1().hex
  start_time = time.time()

  start_times[id] = [start_time, seconds, callback]

def time_log(str):
  def wrapper():
    print(f'{time.time()} {str}')
  return wrapper

def cleanup_loop():
  while True:

    to_remove = []

    for id, data in start_times.items():

      start_time, seconds, callback = data

      elapsed = time.time() - start_time

      if elapsed > seconds:
        print('cleaning', id)
        to_remove.append(id)
        callback()
    
    for id in to_remove:
      del start_times[id]

    time.sleep(60)
