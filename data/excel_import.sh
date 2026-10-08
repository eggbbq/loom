#!/bin/bash
cd "$(dirname "$0")"
# cd ../

python3 ./excel_import.py
# python3 ./excel_import_post.py

# read -p "Press any key to exit"