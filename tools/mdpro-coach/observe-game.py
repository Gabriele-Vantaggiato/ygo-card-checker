"""Read the supported Test Hand recorder and relay snapshots to the loopback bridge."""
import json
import os
from pathlib import Path
import queue
import signal
import sys
import threading
from urllib.request import Request, urlopen
import frida

stopping = threading.Event()
pending = queue.Queue(maxsize=1)
key = os.environ.get('MDPRO_OBSERVER_KEY', '')
if not key:
    raise SystemExit('Avvia il lettore tramite il launcher del coach.')

def on_message(message, _data):
    if message.get('type') == 'send':
        payload = message.get('payload', {})
    elif message.get('type') == 'error':
        payload = {'active': False, 'limited': True, 'event': 'observer-error'}
    else:
        return
    try:
        pending.get_nowait()
    except queue.Empty:
        pass
    try:
        pending.put_nowait(payload)
    except queue.Full:
        pass

def relay():
    while not stopping.is_set():
        try:
            payload = pending.get(timeout=.5)
        except queue.Empty:
            continue
        try:
            data = json.dumps(payload).encode('utf8')
            if len(data) > 2000000:
                continue
            request = Request('http://127.0.0.1:4718/native',data=data,headers={'Content-Type': 'application/json','X-MDPro-Observer-Key': key},method='POST')
            with urlopen(request,timeout=2) as response:
                response.read(256)
        except Exception:
            pass

signal.signal(signal.SIGINT,lambda *_: stopping.set())
signal.signal(signal.SIGTERM,lambda *_: stopping.set())
threading.Thread(target=relay,daemon=True).start()
def watch_shutdown():
    if sys.stdin.readline().strip() == 'stop':
        stopping.set()
threading.Thread(target=watch_shutdown,daemon=True).start()
source = (Path(__file__).parent/'il2cpp-observer.js').read_text(encoding='utf8')
session = None
while not stopping.is_set():
    try:
        device = frida.get_local_device()
        version = (Path(os.environ.get('MDPRO_GAME_ROOT','C:/Games/MDPro4'))/'Data'/'client-version.txt').read_text(encoding='utf8').strip()
        if version != '1.0.6':
            raise RuntimeError('Unsupported MDPro4 version')
        games = [p for p in device.enumerate_processes() if p.name.lower() == 'mdpro4.exe']
        if len(games) != 1:
            stopping.wait(2); continue
        session = device.attach(games[0].pid)
        detached = threading.Event()
        session.on('detached',lambda *_: detached.set())
        script = session.create_script(source)
        script.on('message',on_message)
        script.load()
        print('Lettore Test Hand collegato a MDPro4.',flush=True)
        while not stopping.wait(.5) and not detached.is_set():
            pass
        script.unload()
        session.detach(); session = None
    except Exception as error:
        print(f'Lettore in attesa: {type(error).__name__}: {error}',flush=True)
    finally:
        if session:
            try:
                session.detach()
            except Exception:
                pass
            session = None
        stopping.wait(2)
