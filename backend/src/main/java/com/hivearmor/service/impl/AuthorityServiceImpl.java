package com.hivearmor.service.impl;

import com.hivearmor.domain.Authority;
import com.hivearmor.repository.AuthorityRepository;
import com.hivearmor.service.AuthorityService;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.Optional;

@Service
@Transactional
public class AuthorityServiceImpl implements AuthorityService {

    private final AuthorityRepository authorityRepository;

    public AuthorityServiceImpl(AuthorityRepository authorityRepository) {
        this.authorityRepository = authorityRepository;
    }

    @Override
    public Authority save(Authority authority) {
        return authorityRepository.save(authority);
    }

    @Override
    @Transactional(readOnly = true)
    public List<Authority> findAll() {
        return authorityRepository.findAll();
    }

    @Override
    public Optional<Authority> findOne(String name) {
        return authorityRepository.findById(name);
    }

    @Override
    public void delete(String id) {
        authorityRepository.deleteById(id);
    }
}
