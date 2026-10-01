import fs from 'fs';
let s = fs.readFileSync('src/whiteboard/WhiteboardView.jsx','utf8');
// handleNewBoard
s = s.replace('    persistBoard(b);\n    setBoards(listBoards());\n    setBoard(b); setActiveId(b.id);', '    persistBoard(b);\n    notifyBoardsUpdate();\n    setBoards(listBoards());\n    setBoard(b); setActiveId(b.id);');
// handleDuplicateBoard
s = s.replace('    if (dup) { setBoards(listBoards()); setBoard(dup);', '    if (dup) { notifyBoardsUpdate(); setBoards(listBoards()); setBoard(dup);');
// handleDeleteBoard
s = s.replace('    deleteBoardStore(id);\n    const remaining = listBoards();', '    deleteBoardStore(id);\n    notifyBoardsUpdate();\n    const remaining = listBoards();');
// autosave
s = s.replace('        persistBoard(pendingSaveRef.current);\n        setBoards(listBoards());\n        setSaveState("saved");\n        setSavedAt(new Date());\n        playWb("save");', '        persistBoard(pendingSaveRef.current);\n        notifyBoardsUpdate();\n        setBoards(listBoards());\n        setSaveState("saved");\n        setSavedAt(new Date());\n        playWb("save");');
// manual save
s = s.replaceAll('try { persistBoard(board); setBoards(listBoards()); setSaveState("saved"); setSavedAt(new Date()); notify("Đã lưu"); } catch {}', 'try { persistBoard(board); notifyBoardsUpdate(); setBoards(listBoards()); setSaveState("saved"); setSavedAt(new Date()); notify("Đã lưu"); } catch {}');
// switchBoard persist
s = s.replace('    try { if (board) persistBoard(board); } catch {}', '    try { if (board) { persistBoard(board); notifyBoardsUpdate(); } } catch {}');
// handleRename
s = s.replace('    if (nb) { setBoard(nb); setBoards(listBoards()); notify("Đã đổi tên"); }', '    if (nb) { setBoard(nb); setBoards(listBoards()); notifyBoardsUpdate(); notify("Đã đổi tên"); }');
// handleDuplicateBoard notify already
// for other places where persistBoard is called implicitly via autosave, we already handled
fs.writeFileSync('src/whiteboard/WhiteboardView.jsx', s);
console.log('patched wb2');
