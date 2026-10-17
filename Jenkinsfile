pipeline {
    agent { label 'servidor1' }
    options {
        skipDefaultCheckout(true)
        disableConcurrentBuilds()
        timestamps()
        timeout(time: 25, unit: 'MINUTES')
        buildDiscarder(logRotator(numToKeepStr: '10'))
    }
    triggers { pollSCM('H/5 * * * *') }
    environment {
        CI = 'true'
        API_URL = 'https://tickets-api.sivalt.com/api'
        NODE_OPTIONS = '--max-old-space-size=1536'
    }
    stages {
        stage('Checkout main') {
            steps { checkout scm }
        }
        stage('Formato, lint, pruebas y compilacion') {
            steps { sh 'sh scripts/ci.sh' }
        }
        stage('Publicar Firebase Tickets') {
            steps {
                withCredentials([file(credentialsId: 'gcp-wif-oidc', variable: 'ID_TOKEN_FILE')]) {
                    sh '''#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
wif="$(mktemp /tmp/tickets-firebase-wif.XXXXXX)"
trap 'rm -f -- "$wif"' EXIT
export GOOGLE_APPLICATION_CREDENTIALS="$wif"
node scripts/firebase-wif.mjs
npx --yes firebase-tools@15.32.1 deploy --only hosting --project sivalt-tickets-demo --non-interactive
'''
                }
            }
        }
        stage('Comprobar Hosting') {
            steps {
                sh '''#!/usr/bin/env bash
set -Eeuo pipefail
curl --fail --silent --show-error --max-time 30 https://sivalt-tickets-demo.web.app/config.js | grep -Fq 'https://tickets-api.sivalt.com/api'
'''
            }
        }
    }
}
