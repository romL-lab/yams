@echo off
echo [YAMS APP] Activation de l'environnement virtuel...
call venv\Scripts\activate.bat

echo [YAMS APP] Lancement de l'application Flask...
python app.py

pause