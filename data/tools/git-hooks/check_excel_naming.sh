#!/bin/bash

# Git pre-commit hook to check if Excel files in config directory follow naming rules:
# 1. Files starting with "__" are not checked
# 2. Other files must start with an uppercase letter or #followed by uppercase letter

# Get all staged Excel files in the config directory
excel_files=$(git diff --cached --name-only --diff-filter=ACMR | grep -E "^config/.*\.(xls|xlsx)$")

if [ -z "$excel_files" ]; then
    # No matching Excel files found in this commit, exit successfully
    exit 0
fi

error_found=0

for file in $excel_files; do
    # Extract the filename without path
    filename=$(basename "$file")
    
    # Skip files starting with "__"
    if [[ "$filename" =~ ^__ ]]; then
        continue
    fi
    
    # Check if the file starts with uppercase letter or #followed by uppercase
    if [[ ! "$filename" =~ ^[A-Z] && ! "$filename" =~ ^#[A-Z] ]]; then
        echo "Error: Excel file '$file' does not follow naming convention."
        echo "File must start with an uppercase letter or #followed by uppercase letter."
        error_found=1
    fi
done

if [ $error_found -eq 1 ]; then
    echo "Commit failed: Please fix the issues above and try again."
    exit 1
fi

exit 0
