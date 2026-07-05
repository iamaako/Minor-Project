'use strict';

const Workspace = (() => {
  const fileListEl = document.getElementById('file-list');
  const btnNewFile = document.getElementById('btn-new-file');
  let currentActiveFile = 'main.py';

  const newFileContainer = document.getElementById('new-file-container');
  const inputNewFile = document.getElementById('input-new-file');
  const btnCreateFile = document.getElementById('btn-create-file');
  const btnCancelFile = document.getElementById('btn-cancel-file');

  function init() {
    if (!window.examAPI || !window.examAPI.listWorkspace) return;

    if (btnNewFile) {
      btnNewFile.addEventListener('click', () => {
        btnNewFile.style.display = 'none';
        newFileContainer.style.display = 'flex';
        inputNewFile.value = '';
        inputNewFile.focus();
      });
    }

    if (btnCancelFile) {
      btnCancelFile.addEventListener('click', () => {
        newFileContainer.style.display = 'none';
        btnNewFile.style.display = 'block';
      });
    }

    if (btnCreateFile) {
      btnCreateFile.addEventListener('click', async () => {
        const name = inputNewFile.value;
        if (name && name.trim()) {
          await window.examAPI.writeWorkspace(name.trim(), '');
          refreshFileList();
          openFile(name.trim());
        }
        newFileContainer.style.display = 'none';
        btnNewFile.style.display = 'block';
      });
    }

    document.getElementById('tab-btn-questions').addEventListener('click', () => {
      document.getElementById('question-content').style.display = 'block';
      document.getElementById('files-content').style.display = 'none';
      document.getElementById('tab-btn-questions').style.fontWeight = 'bold';
      document.getElementById('tab-btn-questions').style.background = '#ece9d8';
      document.getElementById('tab-btn-files').style.fontWeight = 'normal';
      document.getElementById('tab-btn-files').style.background = '';
    });

    document.getElementById('tab-btn-files').addEventListener('click', () => {
      document.getElementById('question-content').style.display = 'none';
      document.getElementById('files-content').style.display = 'flex';
      document.getElementById('files-content').style.flexDirection = 'column';
      document.getElementById('tab-btn-files').style.fontWeight = 'bold';
      document.getElementById('tab-btn-files').style.background = '#ece9d8';
      document.getElementById('tab-btn-questions').style.fontWeight = 'normal';
      document.getElementById('tab-btn-questions').style.background = '';
      refreshFileList();
    });
  }

  async function refreshFileList() {
    if (!window.examAPI) return;
    const files = await window.examAPI.listWorkspace();
    fileListEl.innerHTML = '';
    files.forEach(f => {
      if(f === 'main.exe') return; 

      const li = document.createElement('li');
      li.style.padding = '5px';
      li.style.cursor = 'pointer';
      li.style.borderBottom = '1px solid #ccc';
      li.style.display = 'flex';
      li.style.justifyContent = 'space-between';
      
      const nameSpan = document.createElement('span');
      nameSpan.textContent = f;
      if (f === currentActiveFile) {
        nameSpan.style.fontWeight = 'bold';
        nameSpan.style.color = 'var(--clr-primary)';
      }

      li.appendChild(nameSpan);

      if (f !== 'main.py' && f !== 'main.cpp' && f !== 'main.c') {
        const delBtn = document.createElement('button');
        delBtn.textContent = 'x';
        delBtn.style.color = 'red';
        delBtn.style.border = 'none';
        delBtn.style.background = 'transparent';
        delBtn.style.cursor = 'pointer';
        delBtn.onclick = (e) => {
          e.stopPropagation();
          
          const modal = document.getElementById('delete-confirm-screen');
          const msg = document.getElementById('delete-confirm-msg');
          const btnYes = document.getElementById('btn-delete-yes');
          const btnNo = document.getElementById('btn-delete-no');
          
          if (!modal) return;
          
          msg.textContent = `Are you sure you want to delete ${f}?`;
          modal.style.display = 'flex';
          
          const cleanup = () => {
            modal.style.display = 'none';
            btnYes.onclick = null;
            btnNo.onclick = null;
          };

          btnNo.onclick = cleanup;
          btnYes.onclick = async () => {
            cleanup();
            await window.examAPI.deleteWorkspace(f);
            if (currentActiveFile === f) currentActiveFile = null;
            refreshFileList();
          };
        };
        li.appendChild(delBtn);
      }

      li.onclick = () => openFile(f);
      fileListEl.appendChild(li);
    });
  }

  async function openFile(filename) {
    if (!window.examAPI) return;
    
    if (currentActiveFile && window.Editor) {
      await window.examAPI.writeWorkspace(currentActiveFile, window.Editor.getCurrentCode());
    }

    const content = await window.examAPI.readWorkspace(filename);
    if (content !== null) {
      currentActiveFile = filename;
      
      let lang = 'plaintext';
      if (filename.endsWith('.py')) lang = 'python';
      else if (filename.endsWith('.c')) lang = 'c';
      else if (filename.endsWith('.cpp')) lang = 'cpp';
      else if (filename.endsWith('.json')) lang = 'json';

      if (window.Editor) {
        window.Editor.setLanguageAndCode(lang, content, filename);
      }
      refreshFileList();
    }
  }

  async function syncActiveFile() {
    if (currentActiveFile && window.Editor && window.examAPI) {
      await window.examAPI.writeWorkspace(currentActiveFile, window.Editor.getCurrentCode());
    }
  }

  return { init, refreshFileList, openFile, syncActiveFile, getCurrentActiveFile: () => currentActiveFile };
})();

window.Workspace = Workspace;
