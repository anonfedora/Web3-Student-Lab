#![no_std]

pub mod token;

use soroban_sdk::{contract, contractimpl, contracttype, Address, Env, String, Symbol, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Certificate {
    pub course_symbol: Symbol,
    pub student: Address,
    pub course_name: String,
    pub issue_date: u64,
    pub revoked: bool,
}

/// Composite storage key: one entry per (course, student) pair.
#[contracttype]
#[derive(Clone)]
pub struct CertKey {
    pub course_symbol: Symbol,
    pub student: Address,
}

const ADMIN_KEY: &str = "admin";

#[contract]
pub struct CertificateContract;

#[contractimpl]
impl CertificateContract {
    /// Initialize the contract with an administrator address.
    /// Must be called once before any other function.
    pub fn init(env: Env, admin: Address) {
        if env.storage().instance().has(&Symbol::new(&env, ADMIN_KEY)) {
            panic!("already initialized");
        }
        env.storage()
            .instance()
            .set(&Symbol::new(&env, ADMIN_KEY), &admin);
    }

    /// Issue certificates to one or more students for a course in a single transaction.
    /// Each student gets a unique certificate stored under (course_symbol, student) key.
    /// A `cert_issued` event is emitted for every certificate.
    pub fn issue(
        env: Env,
        course_symbol: Symbol,
        students: Vec<Address>,
        course_name: String,
    ) -> Vec<Certificate> {
        let issue_date = env.ledger().timestamp();
        let mut issued: Vec<Certificate> = Vec::new(&env);

        for student in students.iter() {
            let key = CertKey {
                course_symbol: course_symbol.clone(),
                student: student.clone(),
            };

            let cert = Certificate {
                course_symbol: course_symbol.clone(),
                student: student.clone(),
                course_name: course_name.clone(),
                issue_date,
                revoked: false,
            };

            env.storage().instance().set(&key, &cert);

            env.events().publish(
                (Symbol::new(&env, "cert_issued"), course_symbol.clone()),
                (student.clone(), course_name.clone()),
            );

            issued.push_back(cert);
        }

        issued
    }

    /// Revoke a certificate by course symbol and student address.
    /// Only callable by the administrator.
    pub fn revoke(env: Env, caller: Address, course_symbol: Symbol, student: Address) {
        caller.require_auth();

        let admin: Address = env
            .storage()
            .instance()
            .get(&Symbol::new(&env, ADMIN_KEY))
            .expect("contract not initialized");

        if caller != admin {
            panic!("unauthorized: only the admin can revoke certificates");
        }

        let key = CertKey {
            course_symbol: course_symbol.clone(),
            student: student.clone(),
        };

        let mut cert: Certificate = env
            .storage()
            .instance()
            .get(&key)
            .expect("certificate not found");

        cert.revoked = true;
        env.storage().instance().set(&key, &cert);

        env.events().publish(
            (Symbol::new(&env, "cert_revoked"), course_symbol),
            (caller, student),
        );
    }

    /// Retrieve a certificate by course symbol and student address.
    pub fn get_certificate(
        env: Env,
        course_symbol: Symbol,
        student: Address,
    ) -> Option<Certificate> {
        let key = CertKey {
            course_symbol,
            student,
        };
        env.storage().instance().get(&key)
    }
}

#[cfg(test)]
mod tests;
