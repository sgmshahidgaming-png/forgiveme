#!/bin/bash
# Usage: bash scripts/bump-version.sh 1.0.1 2
# Bumps version in both Android and iOS at once.

set -e

VERSION=${1:?Usage: ./bump-version.sh VERSION BUILD_NUMBER}
BUILD=${2:?Usage: ./bump-version.sh VERSION BUILD_NUMBER}

echo "Bumping to $VERSION (build $BUILD)..."

# Android
sed -i.bak "s/versionCode .*/versionCode $BUILD/" android/app/build.gradle
sed -i.bak "s/versionName .*/versionName \"$VERSION\"/" android/app/build.gradle
rm android/app/build.gradle.bak

# iOS (macOS only)
if command -v /usr/libexec/PlistBuddy &>/dev/null; then
  /usr/libexec/PlistBuddy -c "Set :CFBundleShortVersionString $VERSION" ios/App/App/Info.plist
  /usr/libexec/PlistBuddy -c "Set :CFBundleVersion $BUILD" ios/App/App/Info.plist
  echo "✓ iOS Info.plist updated"
else
  echo "⚠ PlistBuddy not found — update ios/App/App/Info.plist manually"
fi

echo "✓ Android build.gradle updated"
echo "✓ Done → $VERSION ($BUILD)"
