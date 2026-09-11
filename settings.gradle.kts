// settings.gradle.kts for org/context-util
//
// Same Phase-3 monorepo plumbing as org/util — the Gradle plugins live
// in build-tools (published from org/util) and we just consume them
// here. No local includeBuild: build-tools is a Maven dep, resolved
// from mavenLocal first (so a fresh `publishToMavenLocal` from
// org/util/packages/build-tools wins during local iteration), then
// GitHub Packages, then plugin portal / Maven Central.

import com.zerobias.buildtools.monorepo.Workspace

pluginManagement {
    repositories {
        mavenLocal()
        maven {
            url = uri("https://maven.pkg.github.com/zerobias-org/util")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: "zerobias-org"
                // takeIf(isNotBlank) because `?:` only falls through on NULL, and Actions sets an
                // UNSET secret to the empty string. So a missing READ_TOKEN stopped the chain at
                // "" rather than trying NPM_TOKEN or GITHUB_TOKEN, and Gradle authenticated with
                // an empty password -- which GitHub Packages treats as anonymous and rejects 401.
                // (Verified that the username is irrelevant here: any username with a valid token
                // returns 200, and only the anonymous request returns 401.)
                password = listOf("READ_TOKEN", "NPM_TOKEN", "GITHUB_TOKEN")
                    .firstNotNullOfOrNull { System.getenv(it)?.takeIf(String::isNotBlank) }
                    ?: ""
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
}

buildscript {
    repositories {
        mavenLocal()
        maven {
            url = uri("https://maven.pkg.github.com/zerobias-org/util")
            credentials {
                username = System.getenv("GITHUB_ACTOR") ?: "zerobias-org"
                // takeIf(isNotBlank) because `?:` only falls through on NULL, and Actions sets an
                // UNSET secret to the empty string. So a missing READ_TOKEN stopped the chain at
                // "" rather than trying NPM_TOKEN or GITHUB_TOKEN, and Gradle authenticated with
                // an empty password -- which GitHub Packages treats as anonymous and rejects 401.
                // (Verified that the username is irrelevant here: any username with a valid token
                // returns 200, and only the anonymous request returns 401.)
                password = listOf("READ_TOKEN", "NPM_TOKEN", "GITHUB_TOKEN")
                    .firstNotNullOfOrNull { System.getenv(it)?.takeIf(String::isNotBlank) }
                    ?: ""
            }
        }
        gradlePluginPortal()
        mavenCentral()
    }
    dependencies {
        classpath("com.zerobias:build-tools:1.+")
    }
}

rootProject.name = "context-util"

// No standalone-root exclusions — context-util only has TypeScript
// workspaces, no nested Java/Gradle projects that publish independently.
val packages = Workspace.discoverWorkspaces(settings.rootDir)
for ((_, pkg) in packages) {
    val gradlePath = ":" + pkg.relDir.replace("/", ":")
    include(gradlePath)
    project(gradlePath).projectDir = pkg.dir
}
println("zb.monorepo: included ${packages.size} workspace packages from ${settings.rootDir.name}")
