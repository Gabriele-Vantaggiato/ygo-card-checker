"""Read-only MDPro4 visual coach. Draws only in its own click-through window."""
import ctypes
from ctypes import wintypes
import json
import queue
import threading
import time
import sys
import os
import tkinter as tk
from PIL import ImageGrab
import numpy as np
from vision import DeckRecognizer, StableScene
from urllib.request import Request, urlopen

user32 = ctypes.WinDLL('user32', use_last_error=True)
try:
    user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
except (AttributeError, OSError):
    pass
user32.FindWindowW.argtypes = [wintypes.LPCWSTR, wintypes.LPCWSTR]
user32.FindWindowW.restype = wintypes.HWND
user32.GetForegroundWindow.restype = wintypes.HWND
user32.GetAncestor.argtypes = [wintypes.HWND, wintypes.UINT]
user32.GetAncestor.restype = wintypes.HWND
user32.GetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int]
user32.GetWindowLongPtrW.restype = ctypes.c_ssize_t
user32.SetWindowLongPtrW.argtypes = [wintypes.HWND, ctypes.c_int, ctypes.c_ssize_t]
user32.SetWindowLongPtrW.restype = ctypes.c_ssize_t
user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int, ctypes.c_int, ctypes.c_int, wintypes.UINT]
user32.GetClientRect.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.RECT)]
user32.ClientToScreen.argtypes = [wintypes.HWND, ctypes.POINTER(wintypes.POINT)]
user32.IsIconic.argtypes = [wintypes.HWND]

updates = queue.Queue(maxsize=1)
stopping = threading.Event()

def read_hints():
    while not stopping.is_set():
        try:
            request = Request('http://127.0.0.1:4718/overlay', headers={'Origin': 'http://127.0.0.1:4201'})
            with urlopen(request, timeout=1) as response:
                payload = json.loads(response.read(30000))
        except Exception:
            payload = {'active': False, 'message': 'Avvia il collegamento locale del coach.', 'hand': [], 'next': None}
        try:
            updates.get_nowait()
        except queue.Empty:
            pass
        try:
            updates.put_nowait(payload)
        except queue.Full:
            pass
        stopping.wait(0.5)

root = tk.Tk()
root.title('YGOCardChecker · Coach in-game')
root.overrideredirect(True)
root.wm_attributes('-topmost', True)
root.wm_attributes('-transparentcolor', '#010203')
root.configure(bg='#010203')
root.withdraw()
canvas = tk.Canvas(root, bg='#010203', highlightthickness=0)
canvas.pack(fill='both', expand=True)
root.update_idletasks()
own = user32.GetAncestor(root.winfo_id(), 2)
style = user32.GetWindowLongPtrW(own, -20)
# LAYERED | TRANSPARENT | TOOLWINDOW | NOACTIVATE: every game click passes through.
user32.SetWindowLongPtrW(own, -20, style | 0x80000 | 0x20 | 0x80 | 0x8000000)
payload = {'active': False, 'message': 'Coach pronto: collega il tool locale dal sito.', 'hand': [], 'next': None}
vision_updates = queue.Queue(maxsize=1)
vision_request = queue.Queue(maxsize=1)
confirmed_boxes = []

def read_target():
    recognizer, target_id = None, None
    stable = StableScene()
    while not stopping.is_set():
        try:
            request = vision_request.get(timeout=.5)
        except queue.Empty:
            continue
        try:
            card_id, bounds = request
            if target_id != card_id:
                recognizer = DeckRecognizer(os.path.join(os.environ.get('MDPRO_GAME_ROOT','C:/Games/MDPro4'),'Picture','Art'),[card_id])
                target_id = card_id; stable = StableScene()
            # Capture only the foreground game's client rectangle requested by the renderer.
            game = user32.FindWindowW(None,'MDPro4')
            if not game or user32.GetForegroundWindow() != game:
                continue
            image = np.array(ImageGrab.grab(bbox=bounds,all_screens=True).convert('RGB'))
            detections = stable.observe(recognizer.detect(image))
            result = (card_id,detections or [])
        except Exception:
            result = (None,[])
        try:
            vision_updates.get_nowait()
        except queue.Empty:
            pass
        vision_updates.put_nowait(result)

def paint():
    global payload, confirmed_boxes
    if stopping.is_set():
        root.destroy(); return
    try:
        payload = updates.get_nowait()
    except queue.Empty:
        pass
    game = user32.FindWindowW(None, 'MDPro4')
    if not game or user32.IsIconic(game) or user32.GetForegroundWindow() != game:
        root.withdraw()
        root.after(120, paint)
        return
    rect, point = wintypes.RECT(), wintypes.POINT(0, 0)
    if not user32.GetClientRect(game, ctypes.byref(rect)) or not user32.ClientToScreen(game, ctypes.byref(point)):
        root.after(120, paint)
        return
    width, height = rect.right, rect.bottom
    if width < 600 or height < 350:
        root.withdraw(); root.after(120, paint); return
    root.geometry(f'{width}x{height}+{point.x}+{point.y}')
    root.deiconify()
    user32.SetWindowPos(own, wintypes.HWND(-1), point.x, point.y, width, height, 0x10 | 0x40)
    canvas.delete('all')
    move = payload.get('next') if payload.get('active') else None
    try:
        card_id, boxes = vision_updates.get_nowait()
        confirmed_boxes = boxes if move and move.get('cardId') == card_id else []
    except queue.Empty:
        pass
    color = '#38e8c6' if move else '#e9c875'
    left, top, box_width = int(width*.54), int(height*.17), int(width*.27)
    box_height = 235 if move else 140
    canvas.create_rectangle(left, top, left+box_width, top+box_height, fill='#101a24', outline=color, width=2)
    canvas.create_text(left+14, top+13, anchor='nw', text='YGO COACH · PROSSIMA MOSSA' if move else 'YGO COACH', fill=color, font=('Segoe UI', 10, 'bold'))
    text = f"{move.get('action', '')}\n{move.get('name', '')}" if move else payload.get('message', 'Coach pronto')
    canvas.create_text(left+14, top+39, anchor='nw', text=text, fill='#ffffff', width=box_width-28, font=('Segoe UI', 14, 'bold'))
    if move:
        canvas.create_text(left+14,top+105,anchor='nw',text=move.get('label',''),fill=color,width=box_width-28,font=('Segoe UI',10,'bold'))
        canvas.create_text(left+14,top+145,anchor='nw',text=move.get('detail','')[:210],fill='#d1dae2',width=box_width-28,font=('Segoe UI',10))
    else:
        canvas.create_text(left+14,top+108,anchor='nw',text='Passaggio del mouse e clic liberi sul gioco',fill='#b7c5d0',width=box_width-28,font=('Segoe UI',9))
    if move:
        try:
            vision_request.put_nowait((move['cardId'],(point.x,point.y,point.x+width,point.y+height)))
        except queue.Full:
            pass
        matching = [hit for hit in confirmed_boxes if hit['cardId'] == move['cardId']]
        if matching:
            hit = max(matching,key=lambda item: item['score'])
            x,y,w,h = hit['box']; x1,y1,x2,y2 = x*width,y*height,(x+w)*width,(y+h)*height
            canvas.create_rectangle(x1-5,y1-5,x2+5,y2+5,outline=color,width=4)
            canvas.create_line(left+box_width/2,top+box_height+5,(x1+x2)/2,y1-12,fill=color,width=3,arrow=tk.LAST,arrowshape=(15,18,7))
            canvas.create_text((x1+x2)/2,y1-28,text='CARTA RILEVATA · due letture concordi',fill=color,font=('Segoe UI',10,'bold'))
            if hit['region'] == 'hand' and 'Evoca' in move.get('action',''):
                canvas.create_rectangle(width*.278,height*.56,width*.72,height*.76,outline='#6dff75',width=3,dash=(10,6))
                canvas.create_text(width*.50,height*.535,text='MANO → ZONA MOSTRI',fill='#6dff75',font=('Segoe UI',11,'bold'))
        else:
            canvas.create_text(left+14,top+box_height+12,anchor='nw',text='Individuazione visiva della carta…',fill=color,font=('Segoe UI',10))
    root.after(120, paint)

threading.Thread(target=read_hints, daemon=True).start()
threading.Thread(target=read_target, daemon=True).start()
def watch_shutdown():
    if sys.stdin.readline().strip() == 'stop':
        stopping.set()
threading.Thread(target=watch_shutdown,daemon=True).start()
root.after(120, paint)
try:
    root.mainloop()
finally:
    stopping.set()
