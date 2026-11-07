#!/usr/bin/env python3
"""Run the batch path from the repository root:

    python batch.py claims.csv results.csv
"""
import sys

from canoe.batch import main

if __name__ == "__main__":
    sys.exit(main())
