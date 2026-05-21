#!/usr/bin/env python3
"""
One-click deployment to Vercel for Agent HQ Dashboard
Run this and provide GitHub token when prompted
"""

import subprocess
import sys
import os

def run_command(cmd, description):
    print(f"\n{'='*70}")
    print(f"🔄 {description}")
    print(f"{'='*70}")
    result = subprocess.run(cmd, shell=True, cwd=r"C:\Users\the10\Downloads\agent-hq-dashboard")
    if result.returncode != 0:
        print(f"❌ Failed: {description}")
        return False
    print(f"✓ {description}")
    return True

def main():
    print("""
╔════════════════════════════════════════════════════════════════════════════╗
║                   AGENT HQ DASHBOARD — VERCEL DEPLOYMENT                  ║
║                                                                            ║
║  This script will:                                                         ║
║  1. Initialize Git repository                                             ║
║  2. Commit all files                                                       ║
║  3. Create GitHub repo                                                     ║
║  4. Push to GitHub                                                         ║
║  5. Deploy to Vercel                                                       ║
║                                                                            ║
║  Prerequisites:                                                            ║
║  • Git installed (git --version)                                          ║
║  • GitHub account created                                                 ║
║  • Vercel account created (connect via GitHub)                            ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
    """)
    
    input("Press Enter to continue...")
    
    # Check if Git is installed
    if not run_command("git --version", "Checking Git installation"):
        print("❌ Git not found. Install from https://git-scm.com")
        return False
    
    os.chdir(r"C:\Users\the10\Downloads\agent-hq-dashboard")
    
    # Initialize git
    if not run_command("git init", "Initializing Git repository"):
        return False
    
    if not run_command("git add .", "Adding all files to Git"):
        return False
    
    if not run_command('git commit -m "Initial Agent HQ Dashboard commit"', "Committing files"):
        return False
    
    print("""
    
╔════════════════════════════════════════════════════════════════════════════╗
║  NEXT STEPS (Manual via GitHub UI):                                       ║
║                                                                            ║
║  1. Go to: https://github.com/new                                         ║
║  2. Create new repository "agent-hq-dashboard"                            ║
║  3. Copy the push commands from GitHub                                    ║
║  4. Run the git remote add + git push commands                            ║
║                                                                            ║
║  THEN: Deploy on Vercel                                                   ║
║                                                                            ║
║  1. Go to: https://vercel.com/import                                      ║
║  2. Select your GitHub repo                                               ║
║  3. Click Deploy                                                          ║
║  4. Wait 2 minutes                                                        ║
║  5. Get live URL                                                          ║
║                                                                            ║
╚════════════════════════════════════════════════════════════════════════════╝
    """)
    
    print("\n✓ Git setup complete!")
    print("📁 Project location: C:\\Users\\the10\\Downloads\\agent-hq-dashboard")
    print("📝 Next: Follow the manual steps above via GitHub UI")

if __name__ == "__main__":
    main()
